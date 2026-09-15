/**
 * `POST /transactions/submit` — Gerçek Middleware Zinciri Entegrasyon Testi
 *
 * Diğer testlerin aksine (`transaction.routes.test.js`, `auth.middleware.test.js`)
 * burada handler'lar TEK TEK, elle kurulmuş req/res nesneleriyle ÇAĞRILMAZ.
 * Bunun yerine `transaction.routes.js`'in PRODUCTION'DA KULLANILAN gerçek
 * router'ı (`validateTransactionSubmit` → `submitAuthMiddleware` →
 * `idempotencyMiddleware` → `submitTransactionHandler`, index.js'teki ile
 * BİREBİR AYNI sıra) gerçek bir Express uygulamasına bağlanır, gerçek bir
 * HTTP soketi üzerinden (`fetch`) istek gönderilir — yalnızca Stellar
 * ağ katmanı (Horizon/Soroban) ve MongoDB mock'lanır MI? MongoDB de
 * mock'lanmaz: `mongodb-memory-server` ile gerçek (bellek-içi) bir Mongo
 * örneğine gerçek Mongoose bağlantısı kurulur — `Merchant`/`Transaction`/
 * `IdempotencyKey` koleksiyonlarına GERÇEK yazma/okuma yapılır. Yalnızca
 * Stellar Horizon/Soroban ağ çağrıları mock'lanır (diğer testlerle aynı
 * kalıp) — gerçek testnet'e gitmeden.
 *
 * Amaç: hem esnaf-Bearer yolunun hem müşteri-imza yolunun middleware
 * zincirinin TAMAMINDAN (doğru sırayla) gerçekten geçtiğini kanıtlamak.
 *
 * NOT: `MongoMemoryReplSet` kullanılır, tek düğümlü `MongoMemoryServer` DEĞİL —
 * `idempotency.service.js`'teki `readConcern: 'linearizable'` sorgusu
 * (tekrarlanan istek/replay yolu) YALNIZCA bir replica set üyesinde çalışır;
 * standalone bir Mongo'da `node needs to be a replica set member to use
 * read concern` hatasıyla PATLAR — bu test yazılırken GERÇEKTEN yakalandı.
 * Üretimdeki gerçek MongoDB Atlas cluster'ı zaten bir replica set olduğu
 * için `MongoMemoryReplSet` üretim topolojisini daha doğru yansıtır.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import Merchant from '../src/models/Merchant.model.js';
import Transaction from '../src/models/Transaction.model.js';
import IdempotencyKey from '../src/models/IdempotencyKey.model.js';
import { hashApiKey } from '../src/utils/crypto.js';
import transactionRoutes from '../src/api/routes/transaction.routes.js';
import { flushFlowEvents } from '../src/services/flow-events.service.js';

const DUMMY_CONTRACT_ID = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

/** `transaction.routes.test.js` ile AYNI kalıp — imzalı, tek operasyonlu bir iç zarf. */
function buildSignedInnerXdr(signerKeypair, sourceAddress = signerKeypair.publicKey()) {
  const account = new StellarSdk.Account(sourceAddress, '100');
  const contract = new StellarSdk.Contract(DUMMY_CONTRACT_ID);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(contract.call('balance', StellarSdk.Address.fromString(sourceAddress).toScVal()))
    .setTimeout(300)
    .build();
  tx.sign(signerKeypair);
  return tx.toXDR();
}

async function createRealMerchant() {
  const apiKey = 'test-api-key-' + randomUUID();
  const merchant = await Merchant.create({
    businessName: 'Entegrasyon Test Esnafı',
    taxId: 'TAX-' + randomUUID(),
    stellarAddress: StellarSdk.Keypair.random().publicKey(),
    apiKeyHash: hashApiKey(apiKey),
    ownershipVerified: true,
    isActive: true,
  });
  return { merchant, apiKey };
}

describe('POST /transactions/submit — Gerçek Middleware Zinciri', () => {
  let mongod;
  let server;
  let baseUrl;

  let originalSoroban;
  let originalHorizon;
  let originalPool2Secret;
  let originalPool2Addr;
  let originalAllowedContracts;

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/v1/transactions', transactionRoutes);

    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    originalSoroban = stellarConfig.sorobanServer;
    originalHorizon = stellarConfig.horizonServer;
    originalPool2Secret = config.secrets.pool2SecretKey;
    originalPool2Addr = config.pools.pool2Address;
    originalAllowedContracts = config.feeBump.allowedContractIds;

    const pool2Kp = StellarSdk.Keypair.random();
    config.secrets.pool2SecretKey = pool2Kp.secret();
    config.pools.pool2Address = pool2Kp.publicKey();
    config.feeBump.allowedContractIds = [DUMMY_CONTRACT_ID];

    // Yalnızca Stellar ağ katmanı mock'lanır — MongoDB GERÇEKTİR (yukarıda).
    stellarConfig.sorobanServer = { simulateTransaction: async () => ({ transactionData: {} }) };
    stellarConfig.horizonServer = {
      submitTransaction: async () => ({ hash: 'integration-hash-' + randomUUID(), ledger: 999 }),
    };
  });

  after(async () => {
    stellarConfig.sorobanServer = originalSoroban;
    stellarConfig.horizonServer = originalHorizon;
    config.secrets.pool2SecretKey = originalPool2Secret;
    config.pools.pool2Address = originalPool2Addr;
    config.feeBump.allowedContractIds = originalAllowedContracts;

    await flushFlowEvents();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    // Her test kendi izole verisiyle çalışsın — gerçek koleksiyonlar temizlenir.
    await Promise.all([Merchant.deleteMany({}), Transaction.deleteMany({}), IdempotencyKey.deleteMany({})]);
  });

  it('esnaf-Bearer yolu: gerçek zincirden (validate→auth→idempotency→handler) geçip 201 dönmeli ve gerçek Mongo kayıtları oluşturmalı', async () => {
    const { merchant, apiKey } = await createRealMerchant();
    const senderKp = StellarSdk.Keypair.random();
    const signedXdr = buildSignedInnerXdr(senderKp);
    const idempotencyKey = randomUUID();

    const response = await fetch(`${baseUrl}/api/v1/transactions/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        signedXdr,
        merchantId: merchant._id.toString(),
        totalAmount: '10000000',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.status, 'submitted');

    // Gerçek Mongo'da GERÇEKTEN yazıldığını doğrula — mock değil.
    const txDoc = await Transaction.findOne({ idempotencyKey });
    assert.ok(txDoc, 'Transaction koleksiyonuna gerçekten yazılmalı');
    assert.equal(txDoc.merchantId.toString(), merchant._id.toString());
    assert.equal(txDoc.senderAddress, senderKp.publicKey());
    assert.equal(txDoc.status, 'submitted');

    const idemDoc = await IdempotencyKey.findOne({ key: idempotencyKey });
    assert.ok(idemDoc, 'IdempotencyKey koleksiyonuna gerçekten yazılmalı');
    assert.equal(idemDoc.status, 'completed');
  });

  it('esnaf-Bearer yolu: başka bir esnaf adına gönderirse zincir 403 ile durmalı ve idempotency kaydı failed olmalı', async () => {
    const { apiKey } = await createRealMerchant(); // kimliği doğrulanan esnaf
    const { merchant: otherMerchant } = await createRealMerchant(); // body'deki (başka) esnaf
    const senderKp = StellarSdk.Keypair.random();
    const signedXdr = buildSignedInnerXdr(senderKp);
    const idempotencyKey = randomUUID();

    const response = await fetch(`${baseUrl}/api/v1/transactions/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ signedXdr, merchantId: otherMerchant._id.toString(), totalAmount: '10000000' }),
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error, 'FORBIDDEN');

    const idemDoc = await IdempotencyKey.findOne({ key: idempotencyKey });
    assert.ok(idemDoc, 'idempotencyMiddleware zincirde ÇALIŞMIŞ olmalı (kilit alınmış)');
    assert.equal(idemDoc.status, 'failed');

    const txDoc = await Transaction.findOne({ idempotencyKey });
    assert.equal(txDoc, null, 'Transaction OLUŞTURULMAMALI — 403 handler içinde erken döner');
  });

  it('müşteri-imza yolu: Authorization başlığı OLMADAN, signedXdr kendi kaynağınca imzalıysa zincirden geçip 201 dönmeli', async () => {
    const { merchant } = await createRealMerchant(); // yalnızca geçerli bir merchantId için
    const customerKp = StellarSdk.Keypair.random();
    const signedXdr = buildSignedInnerXdr(customerKp);
    const idempotencyKey = randomUUID();

    const response = await fetch(`${baseUrl}/api/v1/transactions/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // DİKKAT: Authorization başlığı KASITLI OLARAK yok.
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ signedXdr, merchantId: merchant._id.toString(), totalAmount: '5000000' }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.status, 'submitted');

    const txDoc = await Transaction.findOne({ idempotencyKey });
    assert.ok(txDoc, 'Transaction koleksiyonuna gerçekten yazılmalı (müşteri yolu)');
    assert.equal(txDoc.senderAddress, customerKp.publicKey());

    const idemDoc = await IdempotencyKey.findOne({ key: idempotencyKey });
    assert.equal(idemDoc.status, 'completed');
  });

  it('müşteri-imza yolu: signedXdr kaynak hesabınca imzalanmamışsa (sahte imza) 401 ile durmalı — idempotencyMiddleware\'e HİÇ ulaşılmamalı', async () => {
    const { merchant } = await createRealMerchant();
    const claimedSourceKp = StellarSdk.Keypair.random(); // iddia edilen kaynak
    const wrongSignerKp = StellarSdk.Keypair.random(); // gerçekte imzalayan (başka anahtar)
    const spoofedXdr = buildSignedInnerXdr(wrongSignerKp, claimedSourceKp.publicKey());
    const idempotencyKey = randomUUID();

    const response = await fetch(`${baseUrl}/api/v1/transactions/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ signedXdr: spoofedXdr, merchantId: merchant._id.toString(), totalAmount: '5000000' }),
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, 'UNAUTHORIZED');

    // Zincir sırasının kanıtı: submitAuthMiddleware idempotencyMiddleware'DEN
    // ÖNCE çalışır — reddedilen bir istek hiçbir kilit/DB kaydı bırakmamalı.
    const idemDoc = await IdempotencyKey.findOne({ key: idempotencyKey });
    assert.equal(idemDoc, null, 'idempotencyMiddleware çalışmamış olmalı — auth ondan önce reddetti');
  });

  it('validateTransactionSubmit zincirde İLK çalışır: eksik merchantId, Authorization/imza olmadan bile kendi VALIDATION_ERROR\'ıyla 400 döner', async () => {
    const senderKp = StellarSdk.Keypair.random();
    const signedXdr = buildSignedInnerXdr(senderKp);

    const response = await fetch(`${baseUrl}/api/v1/transactions/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
      // merchantId KASITLI OLARAK eksik — geçerli bir signedXdr olsa bile
      // (yani submitAuthMiddleware'in kendisi bu isteği reddetmeye YETERLİ
      // olurdu) validateTransactionSubmit ondan ÖNCE, kendi mesajıyla durmalı.
      body: JSON.stringify({ signedXdr, totalAmount: '5000000' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'VALIDATION_ERROR');
    assert.match(body.message, /merchantId/);
  });

  it('idempotency replay: aynı key ile ikinci müşteri-yolu isteği, işlemi TEKRAR göndermeden önbellekteki sonucu 200 ile döndürmeli', async () => {
    const { merchant } = await createRealMerchant();
    const customerKp = StellarSdk.Keypair.random();
    const signedXdr = buildSignedInnerXdr(customerKp);
    const idempotencyKey = randomUUID();
    const requestBody = JSON.stringify({ signedXdr, merchantId: merchant._id.toString(), totalAmount: '5000000' });
    const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey };

    const first = await fetch(`${baseUrl}/api/v1/transactions/submit`, { method: 'POST', headers, body: requestBody });
    const firstBody = await first.json();
    assert.equal(first.status, 201);

    const second = await fetch(`${baseUrl}/api/v1/transactions/submit`, { method: 'POST', headers, body: requestBody });
    const secondBody = await second.json();

    assert.equal(second.status, 200, 'tamamlanmış bir key tekrar gönderilirse 200 (replay) dönmeli, 201 DEĞİL');
    assert.deepEqual(secondBody, firstBody, 'önbellekteki SONUÇ birebir aynı dönmeli');

    const txCount = await Transaction.countDocuments({ idempotencyKey });
    assert.equal(txCount, 1, 'işlem GERÇEKTEN yalnızca BİR KEZ oluşturulmuş olmalı');
  });

  it('canlı işlem akışı: gerçek zincirden geçen ödeme 1-6. adımları sırayla, gerçek veriyle yazmalı', async () => {
    // 5-6. adımların kaynağı: gerçek testnet ödemesinin kaydedilmiş RPC cevabı.
    const fixture = JSON.parse(
      readFileSync(new URL('./fixtures/pay-merchant-b5466573.json', import.meta.url), 'utf8')
    );
    const originalContracts = { ...config.contracts };
    const previousSoroban = stellarConfig.sorobanServer;
    config.contracts.poolManagerId = fixture.contracts.poolManagerId;
    config.contracts.dtlTokenId = fixture.contracts.dtlTokenId;
    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({ transactionData: {} }),
      getTransaction: async () => ({
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
      }),
    };

    try {
      const { merchant } = await createRealMerchant();
      const customerKp = StellarSdk.Keypair.random();
      const signedXdr = buildSignedInnerXdr(customerKp);
      const idempotencyKey = randomUUID();

      const response = await fetch(`${baseUrl}/api/v1/transactions/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ signedXdr, merchantId: merchant._id.toString(), totalAmount: '25000000' }),
      });
      assert.equal(response.status, 201);

      // 5-6. adımlar cevabı bekletmeden arka planda okunur — tamamlanmasını bekle.
      let txDoc;
      for (let i = 0; i < 100; i += 1) {
        await flushFlowEvents();
        txDoc = await Transaction.findOne({ idempotencyKey }).lean();
        if (txDoc.flowEvents.some((e) => e.step === 'distribution')) break;
        await new Promise((r) => setTimeout(r, 20));
      }

      assert.deepEqual(
        txDoc.flowEvents.map((e) => [e.step, e.status]),
        [
          ['signed', 'done'],
          ['received', 'done'],
          ['fee_bump', 'done'],
          ['submitted', 'done'],
          ['contract', 'done'],
          ['distribution', 'done'],
        ]
      );

      const byStep = Object.fromEntries(txDoc.flowEvents.map((e) => [e.step, e]));
      const innerTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, stellarConfig.networkPassphrase);
      assert.equal(byStep.signed.data.signer, customerKp.publicKey());
      assert.equal(byStep.signed.data.innerTxHash, innerTx.hash().toString('hex'));
      assert.equal(txDoc.innerTxHash, innerTx.hash().toString('hex'));
      assert.equal(byStep.received.data.idempotencyKey, idempotencyKey);
      assert.equal(byStep.received.data.authPath, 'customer_signature');
      assert.equal(byStep.fee_bump.data.feeSource, config.pools.pool2Address, 'ücreti Havuz 2 üstlenmeli');
      assert.equal(byStep.submitted.data.txHash, txDoc.txHash);
      assert.ok(byStep.submitted.data.sentAt, 'gönderim anı kaydedilmeli');
      assert.equal(byStep.distribution.data.branches[0].label, 'Havuz 1 (Esnaf Kasası)');
      assert.equal(txDoc.pool1Amount, '24900000');

      // Zaman sırası gerçek: imza doğrulaması ≤ kilit ≤ fee-bump ≤ Horizon cevabı
      const times = ['signed', 'received', 'fee_bump', 'submitted'].map((s) => new Date(byStep[s].at).getTime());
      assert.deepEqual([...times].sort((a, b) => a - b), times);
    } finally {
      config.contracts.poolManagerId = originalContracts.poolManagerId;
      config.contracts.dtlTokenId = originalContracts.dtlTokenId;
      stellarConfig.sorobanServer = previousSoroban;
    }
  });

  describe('POST /:txHash/merchant-ack — akışın 9. adımı', () => {
    async function createConfirmedTx(merchantId) {
      return Transaction.create({
        idempotencyKey: randomUUID(),
        senderAddress: StellarSdk.Keypair.random().publicKey(),
        merchantId,
        totalAmount: '25000000',
        status: 'confirmed',
        txHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
      });
    }

    const ack = (txHash, apiKey, body = {}) =>
      fetch(`${baseUrl}/api/v1/transactions/${txHash}/merchant-ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify(body),
      });

    it('esnaf kendi işlemini bildirince merchant_seen olayı işletme adı ve adresiyle yazılmalı; ikinci bildirim tekrar yazmamalı', async () => {
      const { merchant, apiKey } = await createRealMerchant();
      const tx = await createConfirmedTx(merchant._id);

      const first = await ack(tx.txHash, apiKey, { detectedLedger: 4628674 });
      assert.equal(first.status, 200);
      assert.deepEqual(await first.json(), { acknowledged: true, duplicate: false });

      const second = await ack(tx.txHash, apiKey, { detectedLedger: 4628674 });
      assert.deepEqual(await second.json(), { acknowledged: true, duplicate: true });

      await flushFlowEvents();
      const doc = await Transaction.findById(tx._id).lean();
      const seen = doc.flowEvents.filter((e) => e.step === 'merchant_seen');
      assert.equal(seen.length, 1);
      assert.equal(seen[0].data.businessName, 'Entegrasyon Test Esnafı');
      assert.equal(seen[0].data.merchantAddress, merchant.stellarAddress);
      assert.equal(seen[0].data.detectedLedger, 4628674);
    });

    it('başka esnafın işlemi için 403, bilinmeyen hash için 404, API anahtarı yoksa 401 dönmeli', async () => {
      const { merchant: owner } = await createRealMerchant();
      const { apiKey: otherKey } = await createRealMerchant();
      const tx = await createConfirmedTx(owner._id);

      assert.equal((await ack(tx.txHash, otherKey)).status, 403);
      assert.equal((await ack('9'.repeat(64), otherKey)).status, 404);
      assert.equal((await ack(tx.txHash, null)).status, 401);

      await flushFlowEvents();
      const doc = await Transaction.findById(tx._id).lean();
      assert.equal(doc.flowEvents.length, 0, 'yetkisiz bildirim akışa yazılmamalı');
    });
  });

  it('canlı işlem akışı: ön-simülasyon başarısızsa 3. adım (fee_bump) failed yazılmalı, Horizon\'a gidilmemeli', async () => {
    const previousSoroban = stellarConfig.sorobanServer;
    const previousHorizon = stellarConfig.horizonServer;
    let horizonCalled = false;
    stellarConfig.sorobanServer = { simulateTransaction: async () => ({ error: 'HostError: kontrat panikledi' }) };
    stellarConfig.horizonServer = {
      submitTransaction: async () => {
        horizonCalled = true;
        return { hash: 'x', ledger: 1 };
      },
    };

    try {
      const { merchant } = await createRealMerchant();
      const customerKp = StellarSdk.Keypair.random();
      const idempotencyKey = randomUUID();

      const response = await fetch(`${baseUrl}/api/v1/transactions/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          signedXdr: buildSignedInnerXdr(customerKp),
          merchantId: merchant._id.toString(),
          totalAmount: '25000000',
        }),
      });
      assert.equal(response.status, 502);
      await flushFlowEvents();

      const txDoc = await Transaction.findOne({ idempotencyKey }).lean();
      assert.deepEqual(
        txDoc.flowEvents.map((e) => [e.step, e.status]),
        [
          ['signed', 'done'],
          ['received', 'done'],
          ['fee_bump', 'failed'],
        ]
      );
      assert.match(txDoc.flowEvents[2].data.error, /simülasyonu başarısız/);
      assert.equal(horizonCalled, false);
    } finally {
      stellarConfig.sorobanServer = previousSoroban;
      stellarConfig.horizonServer = previousHorizon;
    }
  });
});
