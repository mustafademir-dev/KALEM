/**
 * Rate Limiting Middleware Testleri
 *
 * İki katmanlı test:
 *
 * 1. **Birim testleri** — her limiter'ın sayaç davranışı ve ANAHTAR SEÇİMİ
 *    (IP mi, gönderen adresi mi, esnaf mı). Anahtar seçimi kritiktir: yanlış
 *    anahtar, ya meşru kullanıcıları topluca kilitler (herkes tek IP'de
 *    sayılırsa) ya da limiti tamamen etkisiz kılar (bedava üretilen adresler
 *    ayrı ayrı sayılırsa).
 *
 * 2. **Entegrasyon testi (asıl önemli olan)** — `transaction.routes.js`'in
 *    GERÇEK router'ı, gerçek (bellek-içi) MongoDB ile bağlanır ve limit
 *    aşıldığında **hiçbir IdempotencyKey/Transaction kaydının OLUŞMADIĞI**
 *    doğrulanır. Bu, "limiter var" değil "**limiter DOĞRU YERDE**" iddiasını
 *    kanıtlar — §6.2'nin bütün amacı, isteğin DB yazmasına ve Soroban RPC'sine
 *    ulaşmadan reddedilmesidir. Limiter zincirin sonunda olsaydı bu test
 *    başarısız olurdu.
 *
 * NOT: Limiter'lar modül yüklenirken `config.rateLimit`'ten kurulur. Bu yüzden
 * test sınırları `process.env`'e YAZILDIKTAN SONRA `await import()` ile dinamik
 * olarak yüklenir — statik `import` hoisting nedeniyle env'i geç ayarlardı.
 * `node --test` her test dosyasını ayrı bir süreçte çalıştırdığı için bu env
 * değişiklikleri diğer test dosyalarını ETKİLEMEZ.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

// --- Sınırları küçült: testler birkaç istekte limiti aşabilsin ---
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.RATE_LIMIT_SUBMIT_IP_MAX = '50'; // kimlik testlerini boğmayacak kadar geniş
process.env.RATE_LIMIT_SUBMIT_IP_WINDOW_MS = '60000';
process.env.RATE_LIMIT_SUBMIT_IDENTITY_MAX = '2';
process.env.RATE_LIMIT_SUBMIT_IDENTITY_WINDOW_MS = '60000';
process.env.RATE_LIMIT_FAUCET_ADDRESS_MAX = '2';
process.env.RATE_LIMIT_FAUCET_ADDRESS_WINDOW_MS = '60000';
process.env.RATE_LIMIT_FAUCET_IP_MAX = '50';
process.env.RATE_LIMIT_FAUCET_IP_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MERCHANT_REGISTER_MAX = '2';
process.env.RATE_LIMIT_MERCHANT_REGISTER_WINDOW_MS = '60000';
process.env.RATE_LIMIT_GIB_READ_MAX = '2';
process.env.RATE_LIMIT_GIB_READ_WINDOW_MS = '60000';

// env ayarlandıktan SONRA yükle (bkz. dosya başı notu).
const config = (await import('../src/config/index.js')).default;
const stellarConfig = (await import('../src/config/stellar.js')).default;
const {
  submitIpRateLimiter,
  submitIdentityRateLimiter,
  faucetAddressRateLimiter,
  merchantRegisterRateLimiter,
  gibReadRateLimiter,
} = await import('../src/api/middleware/rate-limit.middleware.js');

const Merchant = (await import('../src/models/Merchant.model.js')).default;
const Transaction = (await import('../src/models/Transaction.model.js')).default;
const IdempotencyKey = (await import('../src/models/IdempotencyKey.model.js')).default;
const transactionRoutes = (await import('../src/api/routes/transaction.routes.js')).default;

const DUMMY_CONTRACT_ID = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

/**
 * Tek bir limiter'ı izole bir Express uygulamasına bağlayıp dinlemeye alır.
 *
 * @param {import('express').RequestHandler[]} middlewares
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>}
 */
async function startAppWith(...middlewares) {
  const app = express();
  app.use(express.json());
  app.post('/t', ...middlewares, (req, res) => res.status(200).json({ ok: true }));
  app.get('/t', ...middlewares, (req, res) => res.status(200).json({ ok: true }));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** İmzalı `pay_merchant(from, merchant, amount)` iç zarfı — gerçek müşteri ödemesinin biçimi. */
function buildSignedInnerXdr(signerKeypair, merchantAddress, amount = '10000000') {
  const source = signerKeypair.publicKey();
  const account = new StellarSdk.Account(source, '100');
  const contract = new StellarSdk.Contract(DUMMY_CONTRACT_ID);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(
      contract.call(
        'pay_merchant',
        StellarSdk.Address.fromString(source).toScVal(),
        StellarSdk.Address.fromString(merchantAddress).toScVal(),
        StellarSdk.nativeToScVal(BigInt(amount), { type: 'i128' })
      )
    )
    .setTimeout(300)
    .build();
  tx.sign(signerKeypair);
  return tx.toXDR();
}

// ---------------------------------------------------------------------------
// 1. Birim testleri — sayaç davranışı ve anahtar seçimi
// ---------------------------------------------------------------------------

describe('Rate Limit Middleware — sayaç davranışı', () => {
  it('limit içindeki istekler geçmeli, limiti aşan istek 429 + RATE_LIMITED dönmeli', async () => {
    const app = await startAppWith(merchantRegisterRateLimiter); // max = 2
    try {
      const first = await fetch(`${app.baseUrl}/t`, { method: 'POST' });
      const second = await fetch(`${app.baseUrl}/t`, { method: 'POST' });
      const third = await fetch(`${app.baseUrl}/t`, { method: 'POST' });

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(third.status, 429, 'limiti aşan istek 429 dönmeli');

      const body = await third.json();
      assert.equal(body.error, 'RATE_LIMITED');
      assert.equal(typeof body.message, 'string');
      assert.ok(body.message.length > 0, 'kullanıcıya gösterilecek Türkçe mesaj taşımalı');
    } finally {
      await app.close();
    }
  });

  it('standart RateLimit-* başlıklarını göndermeli, legacy X-RateLimit-* göndermemeli', async () => {
    const app = await startAppWith(gibReadRateLimiter);
    try {
      const res = await fetch(`${app.baseUrl}/t`);
      assert.ok(res.headers.get('ratelimit-limit'), 'RateLimit-Limit başlığı bulunmalı');
      assert.equal(res.headers.get('x-ratelimit-limit'), null, 'legacy başlık kapalı olmalı');
    } finally {
      await app.close();
    }
  });
});

describe('Rate Limit Middleware — anahtar seçimi', () => {
  it('submitIdentity: FARKLI gönderen adresleri AYRI sayılmalı (aynı IP olsa bile)', async () => {
    // Bu davranış kritik: TEKNOFEST standında tüm cihazlar aynı NAT arkasındadır.
    // Adres bazlı sayılmasaydı, bir müşterinin ödemeleri diğerlerini kilitlerdi.
    const setSender = (req, res, next) => {
      req.senderAddress = req.get('X-Test-Sender');
      next();
    };
    const app = await startAppWith(setSender, submitIdentityRateLimiter); // max = 2
    try {
      const addrA = StellarSdk.Keypair.random().publicKey();
      const addrB = StellarSdk.Keypair.random().publicKey();
      const call = (addr) => fetch(`${app.baseUrl}/t`, { method: 'POST', headers: { 'X-Test-Sender': addr } });

      assert.equal((await call(addrA)).status, 200);
      assert.equal((await call(addrA)).status, 200);
      assert.equal((await call(addrA)).status, 429, 'A kendi limitini doldurmalı');

      // B, A ile AYNI IP'den gelmesine rağmen etkilenmemeli.
      assert.equal((await call(addrB)).status, 200, 'farklı adres ayrı sayaca sahip olmalı');
    } finally {
      await app.close();
    }
  });

  it('submitIdentity: esnaf yolunda merchantId ile sayılmalı', async () => {
    const setMerchant = (req, res, next) => {
      req.merchantId = req.get('X-Test-Merchant');
      next();
    };
    const app = await startAppWith(setMerchant, submitIdentityRateLimiter); // max = 2
    try {
      const call = (id) => fetch(`${app.baseUrl}/t`, { method: 'POST', headers: { 'X-Test-Merchant': id } });
      assert.equal((await call('merchant-1')).status, 200);
      assert.equal((await call('merchant-1')).status, 200);
      assert.equal((await call('merchant-1')).status, 429);
      assert.equal((await call('merchant-2')).status, 200, 'farklı esnaf ayrı sayaca sahip olmalı');
    } finally {
      await app.close();
    }
  });

  it('faucet: farklı adresler AYRI, aynı adres AYNI sayaçta olmalı', async () => {
    const app = await startAppWith(faucetAddressRateLimiter); // adres max = 2
    try {
      const addrA = StellarSdk.Keypair.random().publicKey();
      const addrB = StellarSdk.Keypair.random().publicKey();
      const call = (address) =>
        fetch(`${app.baseUrl}/t`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });

      assert.equal((await call(addrA)).status, 200);
      assert.equal((await call(addrA)).status, 200);
      assert.equal((await call(addrA)).status, 429, 'aynı adres limitini doldurmalı');
      assert.equal((await call(addrB)).status, 200, 'başka adres ayrı sayılmalı');
    } finally {
      await app.close();
    }
  });

  it('RATE_LIMIT_ENABLED=false iken limiter geçirgen olmalı (yalnızca yerel hata ayıklama)', async () => {
    const original = config.rateLimit.enabled;
    config.rateLimit.enabled = false;
    try {
      // Cache-buster ile modülü YENİDEN yükle — limiter'lar mutasyona uğramış config'i okusun.
      const fresh = await import('../src/api/middleware/rate-limit.middleware.js?disabled=1');
      const app = await startAppWith(fresh.merchantRegisterRateLimiter);
      try {
        for (let i = 0; i < 5; i += 1) {
          const res = await fetch(`${app.baseUrl}/t`, { method: 'POST' });
          assert.equal(res.status, 200, `${i + 1}. istek limitsiz geçmeli`);
        }
      } finally {
        await app.close();
      }
    } finally {
      config.rateLimit.enabled = original;
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Entegrasyon — limiter GERÇEKTEN doğru yerde mi?
// ---------------------------------------------------------------------------

describe('POST /transactions/submit — rate limit, DB yazmasından ÖNCE devreye girmeli', () => {
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
    app.use('/api/v1/transactions', transactionRoutes); // GERÇEK router, gerçek zincir

    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
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

    // Yalnızca Stellar ağ katmanı mock'lanır — MongoDB gerçektir.
    stellarConfig.sorobanServer = { simulateTransaction: async () => ({ transactionData: {} }) };
    stellarConfig.horizonServer = {
      submitTransaction: async () => ({ hash: 'ratelimit-hash-' + randomUUID(), ledger: 999 }),
    };
  });

  after(async () => {
    stellarConfig.sorobanServer = originalSoroban;
    stellarConfig.horizonServer = originalHorizon;
    config.secrets.pool2SecretKey = originalPool2Secret;
    config.pools.pool2Address = originalPool2Addr;
    config.feeBump.allowedContractIds = originalAllowedContracts;

    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([Merchant.deleteMany({}), Transaction.deleteMany({}), IdempotencyKey.deleteMany({})]);
  });

  it('kimlik limiti aşıldığında 429 dönmeli ve reddedilen istek için HİÇBİR Mongo kaydı oluşmamalı', async () => {
    const merchant = await Merchant.create({
      businessName: 'Rate Limit Test Esnafı',
      taxId: 'TAX-' + randomUUID(),
      stellarAddress: StellarSdk.Keypair.random().publicKey(),
      apiKeyHash: 'x'.repeat(64),
      ownershipVerified: true,
      isActive: true,
    });

    // AYNI müşteri (aynı kimlik anahtarı), her istekte FARKLI Idempotency-Key —
    // yani idempotency koruması değil, YALNIZCA rate limit devreye girmeli.
    const customerKp = StellarSdk.Keypair.random();
    const send = () =>
      fetch(`${baseUrl}/api/v1/transactions/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({
          signedXdr: buildSignedInnerXdr(customerKp, merchant.stellarAddress),
          merchantId: merchant._id.toString(),
          totalAmount: '10000000',
        }),
      });

    const first = await send();
    const second = await send();
    const third = await send(); // kimlik limiti (max = 2) aşıldı

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(third.status, 429, 'üçüncü istek rate limit ile reddedilmeli');
    assert.equal((await third.json()).error, 'RATE_LIMITED');

    // ASIL İDDİA: reddedilen istek zincirin GERİSİNE hiç ulaşmamalı.
    // Limiter idempotencyMiddleware'den SONRA olsaydı burada 3 kayıt olurdu.
    const idemCount = await IdempotencyKey.countDocuments();
    const txCount = await Transaction.countDocuments();
    assert.equal(idemCount, 2, 'reddedilen istek için IdempotencyKey kaydı OLUŞMAMALI');
    assert.equal(txCount, 2, 'reddedilen istek için Transaction kaydı OLUŞMAMALI');
  });

  it('farklı müşteriler birbirinin limitini tüketmemeli (aynı IP, ayrı adresler)', async () => {
    const merchant = await Merchant.create({
      businessName: 'Rate Limit Test Esnafı 2',
      taxId: 'TAX-' + randomUUID(),
      stellarAddress: StellarSdk.Keypair.random().publicKey(),
      apiKeyHash: 'y'.repeat(64),
      ownershipVerified: true,
      isActive: true,
    });

    const send = (kp) =>
      fetch(`${baseUrl}/api/v1/transactions/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          signedXdr: buildSignedInnerXdr(kp, merchant.stellarAddress),
          merchantId: merchant._id.toString(),
          totalAmount: '10000000',
        }),
      });

    const customerA = StellarSdk.Keypair.random();
    const customerB = StellarSdk.Keypair.random();

    await send(customerA);
    await send(customerA);
    assert.equal((await send(customerA)).status, 429, 'A limitini doldurmalı');

    // B aynı soketten/IP'den geliyor ama ayrı bir müşteri — engellenmemeli.
    const bResponse = await send(customerB);
    assert.equal(bResponse.status, 201, 'başka bir müşteri A yüzünden engellenmemeli');
  });
});
