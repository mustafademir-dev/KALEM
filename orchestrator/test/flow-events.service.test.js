/**
 * Canlı İşlem Akışı Servisi Testleri
 *
 * Gerçek (bellek-içi) MongoDB kullanılır — `$push` sırası, `timestamps: false`
 * ve anlık görüntü sorguları mock'la değil gerçek veritabanıyla doğrulanır.
 * Zincir verisi, gerçek testnet ödemesinin kaydedilmiş RPC cevabından gelir.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import Transaction from '../src/models/Transaction.model.js';
import Merchant from '../src/models/Merchant.model.js';
import {
  recordFlowEvent,
  flushFlowEvents,
  subscribeFlow,
  getLatestFlow,
} from '../src/services/flow-events.service.js';
import { recordChainOutcome } from '../src/services/contract-events.service.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/pay-merchant-b5466573.json', import.meta.url), 'utf8'));

function buildRpcResponseFromFixture() {
  return {
    status: fixture.status,
    ledger: fixture.ledger,
    createdAt: fixture.createdAt,
    envelopeXdr: StellarSdk.xdr.TransactionEnvelope.fromXDR(fixture.envelopeXdr, 'base64'),
    resultXdr: StellarSdk.xdr.TransactionResult.fromXDR(fixture.resultXdr, 'base64'),
    events: {
      contractEventsXdr: fixture.contractEventsXdr.map((op) =>
        op.map((e) => StellarSdk.xdr.ContractEvent.fromXDR(e, 'base64'))
      ),
    },
  };
}

async function createTx(overrides = {}) {
  const merchant = await Merchant.create({
    businessName: 'Akış Test Büfesi',
    taxId: 'TAX-' + randomUUID(),
    stellarAddress: StellarSdk.Keypair.random().publicKey(),
    apiKeyHash: 'hash-' + randomUUID(),
    ownershipVerified: true,
    isActive: true,
  });
  const tx = await Transaction.create({
    idempotencyKey: randomUUID(),
    senderAddress: StellarSdk.Keypair.random().publicKey(),
    merchantId: merchant._id,
    totalAmount: '25000000',
    status: 'submitted',
    ...overrides,
  });
  return { tx, merchant };
}

describe('Canlı İşlem Akışı Servisi', () => {
  let mongod;
  const originalSoroban = stellarConfig.sorobanServer;
  const originalContracts = { ...config.contracts };

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());
    config.contracts.poolManagerId = fixture.contracts.poolManagerId;
    config.contracts.dtlTokenId = fixture.contracts.dtlTokenId;
  });

  after(async () => {
    stellarConfig.sorobanServer = originalSoroban;
    Object.assign(config.contracts, originalContracts);
    await flushFlowEvents();
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([Transaction.deleteMany({}), Merchant.deleteMany({})]);
  });

  it('beklenmeden art arda yazılan olaylar çağrı sırasıyla kaydedilmeli', async () => {
    const { tx } = await createTx();

    // Ödeme yolundaki gibi await OLMADAN
    recordFlowEvent(tx._id, 'signed', { data: { n: 1 } });
    recordFlowEvent(tx._id, 'received', { data: { n: 2 } });
    recordFlowEvent(tx._id, 'fee_bump', { data: { n: 3 } });
    recordFlowEvent(tx._id, 'submitted', { data: { n: 4 } });
    await flushFlowEvents();

    const doc = await Transaction.findById(tx._id).lean();
    assert.deepEqual(
      doc.flowEvents.map((e) => [e.step, e.data.n]),
      [['signed', 1], ['received', 2], ['fee_bump', 3], ['submitted', 4]]
    );
  });

  it('akış olayı updatedAt\'i değiştirmemeli (mutabakatın yaş kontrolünü sıfırlamamalı)', async () => {
    const { tx } = await createTx();
    const old = new Date(Date.now() - 60_000);
    await Transaction.collection.updateOne({ _id: tx._id }, { $set: { updatedAt: old } });

    await recordFlowEvent(tx._id, 'submitted', { data: {} });

    const doc = await Transaction.findById(tx._id).lean();
    assert.equal(doc.flowEvents.length, 1);
    assert.equal(doc.updatedAt.getTime(), old.getTime());
  });

  it('geçersiz adım adı yok sayılmalı ve hata fırlatmamalı', async () => {
    const { tx } = await createTx();
    await recordFlowEvent(tx._id, 'uydurma_adim', { data: {} });
    const doc = await Transaction.findById(tx._id).lean();
    assert.equal(doc.flowEvents.length, 0);
  });

  it('aboneler, işletme adı ve adresiyle birlikte güncel anlık görüntüyü almalı', async () => {
    const { tx, merchant } = await createTx({ txHash: fixture.txHash });
    const received = [];
    const unsubscribe = subscribeFlow((flow) => received.push(flow));

    try {
      await recordFlowEvent(tx._id, 'caught', { data: { source: 'reconciliation' } });
    } finally {
      unsubscribe();
    }

    assert.equal(received.length, 1);
    const flow = received[0];
    assert.equal(flow.transactionId, tx._id.toString());
    assert.equal(flow.txHash, fixture.txHash);
    assert.deepEqual(flow.merchant, { businessName: 'Akış Test Büfesi', stellarAddress: merchant.stellarAddress });
    assert.equal(flow.events[0].data.source, 'reconciliation');
    assert.equal(flow.steps.length, 9);
  });

  it('getLatestFlow: akış olayı olan EN YENİ işlemi döndürmeli', async () => {
    const { tx: older } = await createTx();
    await recordFlowEvent(older._id, 'signed');
    const { tx: newer } = await createTx();
    await recordFlowEvent(newer._id, 'signed');
    await createTx(); // olaysız işlem — panelde gösterilmemeli

    const flow = await getLatestFlow();
    assert.equal(flow.transactionId, newer._id.toString());
  });

  it('recordChainOutcome: gerçek RPC cevabından 5. ve 6. adımları yazmalı ve havuz tutarlarını işlemeli', async () => {
    const { tx } = await createTx({ txHash: fixture.txHash });
    stellarConfig.sorobanServer = { getTransaction: async () => buildRpcResponseFromFixture() };

    await recordChainOutcome(tx._id, fixture.txHash);
    await flushFlowEvents();

    const doc = await Transaction.findById(tx._id).lean();
    const contract = doc.flowEvents.find((e) => e.step === 'contract');
    const distribution = doc.flowEvents.find((e) => e.step === 'distribution');

    assert.equal(contract.status, 'done');
    assert.equal(contract.data.ledger, 4628674);
    assert.equal(contract.data.feeSource, 'GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK');

    assert.equal(distribution.status, 'done');
    assert.equal(distribution.data.source, 'soroban_rpc_contract_events');
    assert.deepEqual(
      distribution.data.branches.map((b) => b.label),
      ['Havuz 1 (Esnaf Kasası)', 'Havuz 3 (Sosyal Fon)', 'Havuz 4 (Operasyonel)']
    );

    assert.equal(doc.pool1Amount, '24900000');
    assert.equal(doc.pool3Amount, '25000');
    assert.equal(doc.pool4Amount, '75000');
  });

  it('recordChainOutcome: RPC hatası ödemeyi etkilemeden 5. adımı failed yazmalı', async () => {
    const { tx } = await createTx({ txHash: fixture.txHash });
    stellarConfig.sorobanServer = {
      getTransaction: async () => {
        throw new Error('RPC erişilemiyor');
      },
    };

    await recordChainOutcome(tx._id, fixture.txHash); // fırlatmamalı
    await flushFlowEvents();

    const doc = await Transaction.findById(tx._id).lean();
    assert.equal(doc.flowEvents.length, 1);
    assert.equal(doc.flowEvents[0].step, 'contract');
    assert.equal(doc.flowEvents[0].status, 'failed');
    assert.equal(doc.flowEvents[0].data.reason, 'RPC_ERROR');
    assert.equal(doc.status, 'submitted', 'işlem durumu değişmemeli');
  });
});
