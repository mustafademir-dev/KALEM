/**
 * Esnaf iade ucu (POST /merchants/:id/refunds) — gerçek Express + gerçek (bellek-içi)
 * MongoDB; zincir çağrıları (bakiye okuma, ihraççı burn/mint) sahte bağımlılıkla.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import config from '../src/config/index.js';
import Merchant from '../src/models/Merchant.model.js';
import Transaction from '../src/models/Transaction.model.js';
import GibDocument from '../src/models/GibDocument.model.js';
import { hashApiKey } from '../src/utils/crypto.js';
import { authMiddleware } from '../src/api/middleware/auth.middleware.js';
import { createRefundHandler } from '../src/api/routes/refund.routes.js';
import { planSteps, findRefundTarget } from '../src/services/refund.service.js';
import { summarize, findConfirmedInRange } from '../src/services/merchant-report.service.js';

// 100 TL: esnaf %99,6 / sosyal fon %0,1 / operasyonel %0,3 (stroop)
const HUNDRED = { total: '1000000000', pool1: '996000000', pool3: '1000000', pool4: '3000000' };

async function createMerchant() {
  const apiKey = 'test-api-key-' + randomUUID();
  const merchant = await Merchant.create({
    businessName: 'Kadıköy Kırtasiye',
    taxId: 'TAX-' + randomUUID().slice(0, 10),
    stellarAddress: StellarSdk.Keypair.random().publicKey(),
    apiKeyHash: hashApiKey(apiKey),
    ownershipVerified: true,
    isActive: true,
    onChainRegistered: true,
    kycStatus: 'verified',
  });
  return { merchant, apiKey };
}

async function createPaidTx(merchant, documentNo, { status = 'confirmed', breakdown = true } = {}) {
  const tx = await Transaction.create({
    idempotencyKey: randomUUID(),
    senderAddress: StellarSdk.Keypair.random().publicKey(),
    merchantId: merchant._id,
    totalAmount: HUNDRED.total,
    status,
    txHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
    ...(breakdown ? { pool1Amount: HUNDRED.pool1, pool3Amount: HUNDRED.pool3, pool4Amount: HUNDRED.pool4 } : {}),
  });
  const doc = await GibDocument.create({
    transactionId: tx._id,
    txHash: tx.txHash,
    ublContent: { Invoice: { ID: documentNo } },
    status: 'generated',
  });
  tx.gibDocumentId = doc._id;
  await tx.save();
  return tx;
}

/** Zincir yerine: bakiyeler bir Map'te, her çağrı kaydedilir, istenirse N. çağrıda hata. */
function fakeChain({ balances = {}, failOnCall = null } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      readBalance: async (address) => balances[address] ?? '999999999999',
      issuerCall: async (method, address, amount) => {
        calls.push({ method, address, amount });
        if (failOnCall === calls.length) throw new Error('ağ hatası (sahte)');
        return `hash-${calls.length}`;
      },
    },
  };
}

describe('Esnaf iade ucu', () => {
  let mongod;
  let server;
  let baseUrl;
  let chain;
  let originalPools;

  const post = (merchantId, apiKey, body) =>
    fetch(`${baseUrl}/api/v1/merchants/${merchantId}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify(body),
    });

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    // Her istek, o anki `chain.deps`'i kullanır (testler arasında değiştirilebilsin diye).
    app.post('/api/v1/merchants/:id/refunds', authMiddleware, (req, res) => createRefundHandler(chain.deps)(req, res));
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    originalPools = { ...config.pools };
    config.pools.pool3Address = StellarSdk.Keypair.random().publicKey();
    config.pools.pool4Address = StellarSdk.Keypair.random().publicKey();
  });

  after(async () => {
    Object.assign(config.pools, originalPools);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([Merchant.deleteMany({}), Transaction.deleteMany({}), GibDocument.deleteMany({})]);
    chain = fakeChain();
  });

  it('tam iade: esnaftan, Havuz 3 ve 4\'ten yakar, müşteriye tamamını basar — basma EN SONDA', async () => {
    const { merchant, apiKey } = await createMerchant();
    const tx = await createPaidTx(merchant, 'KALEM20260925000001');

    const res = await post(merchant._id, apiKey, { documentNo: 'KALEM20260925000001' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.refund.status, 'completed');
    assert.equal(body.refundedAmount, HUNDRED.total);

    assert.deepEqual(chain.calls, [
      { method: 'burn', address: merchant.stellarAddress, amount: HUNDRED.pool1 },
      { method: 'burn', address: config.pools.pool3Address, amount: HUNDRED.pool3 },
      { method: 'burn', address: config.pools.pool4Address, amount: HUNDRED.pool4 },
      { method: 'mint', address: tx.senderAddress, amount: HUNDRED.total },
    ]);
    // Toplam arz değişmez: yakılan = basılan.
    const burned = chain.calls.filter((c) => c.method === 'burn').reduce((a, c) => a + BigInt(c.amount), 0n);
    assert.equal(burned, BigInt(HUNDRED.total));

    const saved = await Transaction.findById(tx._id);
    assert.equal(saved.status, 'confirmed', 'zincir onay durumu iadede değişmez');
    assert.equal(saved.refund.status, 'completed');
    assert.equal(saved.refund.steps.length, 4);
  });

  it('issuer-batch tanımlıysa dört adım TEK işlemde gider (burn\'ler, sonra mint)', async () => {
    const { merchant, apiKey } = await createMerchant();
    const tx = await createPaidTx(merchant, 'K-BATCH');
    const batches = [];
    chain.deps.issuerBatch = async (ops) => {
      batches.push(ops);
      return 'hash-batch';
    };

    const res = await post(merchant._id, apiKey, { documentNo: 'K-BATCH' });
    assert.equal(res.status, 200);
    assert.equal(chain.calls.length, 0, 'tek tek çağrı yapılmadı');
    assert.deepEqual(batches, [
      {
        burns: [
          { address: merchant.stellarAddress, amount: HUNDRED.pool1 },
          { address: config.pools.pool3Address, amount: HUNDRED.pool3 },
          { address: config.pools.pool4Address, amount: HUNDRED.pool4 },
        ],
        mints: [{ address: tx.senderAddress, amount: HUNDRED.total }],
      },
    ]);
    const saved = await Transaction.findById(tx._id);
    assert.equal(saved.refund.status, 'completed');
    assert.deepEqual(
      saved.refund.steps.map((s) => [s.name, s.txHash]),
      [
        ['burn_merchant', 'hash-batch'],
        ['burn_pool3', 'hash-batch'],
        ['burn_pool4', 'hash-batch'],
        ['mint_customer', 'hash-batch'],
      ]
    );
  });

  it('tek işlem başarısızsa hiçbir adım tamamlanmış sayılmaz, tekrar denenebilir', async () => {
    const { merchant, apiKey } = await createMerchant();
    const tx = await createPaidTx(merchant, 'K-BATCH-FAIL');
    chain.deps.issuerBatch = async () => {
      throw new Error('ağ hatası (sahte)');
    };

    assert.equal((await post(merchant._id, apiKey, { documentNo: 'K-BATCH-FAIL' })).status, 502);
    const failed = await Transaction.findById(tx._id);
    assert.equal(failed.refund.status, 'failed');
    assert.equal(failed.refund.steps.length, 0);

    let n = 0;
    chain.deps.issuerBatch = async (ops) => {
      n += 1;
      assert.equal(ops.burns.length, 3);
      assert.equal(ops.mints.length, 1);
      return 'hash-retry';
    };
    assert.equal((await post(merchant._id, apiKey, { documentNo: 'K-BATCH-FAIL' })).status, 200);
    assert.equal(n, 1);
  });

  it('aynı fiş ikinci kez iade edilemez', async () => {
    const { merchant, apiKey } = await createMerchant();
    await createPaidTx(merchant, 'KALEM-X');
    assert.equal((await post(merchant._id, apiKey, { documentNo: 'KALEM-X' })).status, 200);

    const res = await post(merchant._id, apiKey, { documentNo: 'KALEM-X' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'ALREADY_REFUNDED');
    assert.equal(chain.calls.length, 4, 'ikinci istekte zincire hiçbir şey gitmedi');
  });

  it('başka esnafın fişi "bulunamadı" döner; olmayan numara da', async () => {
    const { merchant } = await createMerchant();
    const { merchant: other, apiKey: otherKey } = await createMerchant();
    await createPaidTx(merchant, 'KALEM-A');

    const res = await post(other._id, otherKey, { documentNo: 'KALEM-A' });
    assert.equal(res.status, 404);
    assert.equal((await post(other._id, otherKey, { documentNo: 'YOK' })).status, 404);
    assert.equal(chain.calls.length, 0);
  });

  it('yetki: anahtarsız 401, başka esnafın id\'si 403, boş numara 400', async () => {
    const { merchant, apiKey } = await createMerchant();
    const { merchant: other } = await createMerchant();
    assert.equal((await post(merchant._id, null, { documentNo: 'K' })).status, 401);
    assert.equal((await post(other._id, apiKey, { documentNo: 'K' })).status, 403);
    assert.equal((await post(merchant._id, apiKey, { documentNo: '  ' })).status, 400);
  });

  it('onaylanmamış ya da dağılım kaydı olmayan ödeme iade edilmez', async () => {
    const { merchant, apiKey } = await createMerchant();
    await createPaidTx(merchant, 'K-SUB', { status: 'submitted' });
    await createPaidTx(merchant, 'K-NOBR', { breakdown: false });
    assert.equal((await (await post(merchant._id, apiKey, { documentNo: 'K-SUB' })).json()).error, 'NOT_CONFIRMED');
    assert.equal((await (await post(merchant._id, apiKey, { documentNo: 'K-NOBR' })).json()).error, 'NO_BREAKDOWN');
    assert.equal(chain.calls.length, 0);
  });

  it('esnaf bakiyesi yetmezse hiçbir zincir işlemi gönderilmez', async () => {
    const { merchant, apiKey } = await createMerchant();
    await createPaidTx(merchant, 'K-LOW');
    chain = fakeChain({ balances: { [merchant.stellarAddress]: '1' } });

    const res = await post(merchant._id, apiKey, { documentNo: 'K-LOW' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, 'INSUFFICIENT_BALANCE');
    assert.equal(chain.calls.length, 0);
  });

  it('yarıda kalan iade müşteriye para basmaz; tekrar denemede kaldığı yerden sürer', async () => {
    const { merchant, apiKey } = await createMerchant();
    const tx = await createPaidTx(merchant, 'K-HALF');
    chain = fakeChain({ failOnCall: 3 }); // Havuz 4 yakımında düşer

    const first = await post(merchant._id, apiKey, { documentNo: 'K-HALF' });
    assert.equal(first.status, 502);
    assert.ok(!chain.calls.some((c) => c.method === 'mint'), 'müşteriye basma yapılmadı');
    let saved = await Transaction.findById(tx._id);
    assert.equal(saved.refund.status, 'failed');
    assert.deepEqual(saved.refund.steps.map((s) => s.name), ['burn_merchant', 'burn_pool3']);

    chain = fakeChain();
    const retry = await post(merchant._id, apiKey, { documentNo: 'K-HALF' });
    assert.equal(retry.status, 200);
    assert.deepEqual(chain.calls.map((c) => c.method + ':' + c.amount), [
      `burn:${HUNDRED.pool4}`,
      `mint:${HUNDRED.total}`,
    ], 'tamamlanan adımlar tekrarlanmadı');
    saved = await Transaction.findById(tx._id);
    assert.equal(saved.refund.status, 'completed');
    assert.equal(saved.refund.steps.length, 4);
  });

  it('iade edilen ödeme ciro/komisyon toplamlarından düşer', async () => {
    const { merchant, apiKey } = await createMerchant();
    await createPaidTx(merchant, 'K-1');
    await createPaidTx(merchant, 'K-2');
    await post(merchant._id, apiKey, { documentNo: 'K-1' });

    const from = new Date(Date.now() - 60_000);
    const to = new Date(Date.now() + 60_000);
    const summary = summarize(await findConfirmedInRange(merchant._id, from, to));
    assert.equal(summary.count, 1);
    assert.equal(summary.gross, HUNDRED.total);
  });

  it('sıfır tutarlı pay adımı atlanır (kontrat 0\'ı reddeder)', async () => {
    const { merchant } = await createMerchant();
    const steps = planSteps(
      { pool1Amount: '999', pool3Amount: '0', pool4Amount: '2', totalAmount: '1001', senderAddress: 'GX' },
      merchant
    );
    assert.deepEqual(steps.map((s) => s.name), ['burn_merchant', 'burn_pool4', 'mint_customer']);
  });

  it('işlemdeki kilit: işleniyor durumundaki fiş için ikinci istek reddedilir', async () => {
    const { merchant } = await createMerchant();
    const tx = await createPaidTx(merchant, 'K-LOCK');
    await Transaction.updateOne({ _id: tx._id }, { $set: { 'refund.status': 'processing' } });
    await assert.rejects(findRefundTarget(merchant, 'K-LOCK'), (err) => err.code === 'REFUND_IN_PROGRESS');
  });
});
