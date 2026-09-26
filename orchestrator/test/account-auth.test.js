/**
 * Hesap girişleri — müşteri (TC + PIN, cihaz değişiminde bakiye taşıma) ve
 * esnaf (VKN + şifre, oturum anahtarı). Gerçek Express + bellek-içi MongoDB;
 * zincir çağrıları sahte bağımlılıkla.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import config from '../src/config/index.js';
import Customer from '../src/models/Customer.model.js';
import Merchant from '../src/models/Merchant.model.js';
import { buildCustomerAuthChallenge, buildCustomerProfileChallenge, hashApiKey } from '../src/utils/crypto.js';
import { isValidTcKimlik, hashSecret, verifySecret, normalizeFullName, MAX_FAILED_LOGINS } from '../src/utils/credentials.js';
import { registerCustomerHandler, createLoginHandler, updateProfileHandler } from '../src/api/routes/customer.routes.js';
import { loginMerchant } from '../src/api/routes/merchant.routes.js';
import { authMiddleware } from '../src/api/middleware/auth.middleware.js';

const TEST_TC = '10000000146'; // yazılım testlerinde yaygın kullanılan, sağlaması geçerli test numarası
const PIN = '123456';
const NAME = 'Mustafa Demir';

function authBody(kp, extra = {}) {
  const timestamp = Date.now();
  const signature = kp.sign(Buffer.from(buildCustomerAuthChallenge(kp.publicKey(), timestamp), 'utf8')).toString('base64');
  return { tc: TEST_TC, pin: PIN, fullName: NAME, address: kp.publicKey(), timestamp, signature, ...extra };
}

function profileBody(kp, fullName, signer = kp) {
  const timestamp = Date.now();
  const signature = signer
    .sign(Buffer.from(buildCustomerProfileChallenge(kp.publicKey(), timestamp), 'utf8'))
    .toString('base64');
  return { address: kp.publicKey(), timestamp, signature, fullName };
}

describe('TC kimlik ve şifre yardımcıları', () => {
  it('TC sağlama kuralı', () => {
    assert.equal(isValidTcKimlik('10000000146'), true);
    assert.equal(isValidTcKimlik('10000000147'), false);
    assert.equal(isValidTcKimlik('00000000146'), false);
    assert.equal(isValidTcKimlik('1234'), false);
  });
  it('scrypt özeti doğrulanır, yanlış şifre ve bozuk kayıt reddedilir', () => {
    const h = hashSecret('gizli-sifre');
    assert.ok(h.startsWith('scrypt$'));
    assert.equal(verifySecret('gizli-sifre', h), true);
    assert.equal(verifySecret('baska', h), false);
    assert.equal(verifySecret('x', 'bozuk'), false);
  });
});

describe('Hesap uçları', () => {
  let mongod, server, baseUrl, chain, originalSecret;

  const post = (path, body) =>
    fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function fakeChain(balances = {}) {
    const calls = [];
    return {
      calls,
      deps: {
        readBalance: async (a) => balances[a] ?? '0',
        issuerCall: async (method, address, amount) => {
          calls.push({ method, address, amount });
          return `hash-${calls.length}`;
        },
      },
    };
  }

  before(async () => {
    originalSecret = config.secrets.customerIdHashSecret;
    config.secrets.customerIdHashSecret = 'test-secret';
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());
    const app = express();
    app.use(express.json());
    app.post('/customers/register', registerCustomerHandler);
    app.post('/customers/profile', updateProfileHandler);
    app.post('/customers/login', (req, res) => createLoginHandler(chain.deps)(req, res));
    app.post('/merchants/login', loginMerchant);
    app.get('/whoami', authMiddleware, (req, res) => res.json({ merchantId: req.merchantId }));
    await new Promise((r) => { server = app.listen(0, r); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    config.secrets.customerIdHashSecret = originalSecret;
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    await mongod.stop();
  });
  beforeEach(async () => {
    await Promise.all([Customer.deleteMany({}), Merchant.deleteMany({})]);
    chain = fakeChain();
  });

  describe('müşteri', () => {
    it('kayıt: TC açık hâlde saklanmaz, PIN özetlenir; aynı TC ikinci kez açılamaz', async () => {
      const kp = StellarSdk.Keypair.random();
      assert.equal((await post('/customers/register', authBody(kp))).status, 201);

      const raw = await Customer.findOne({}).select('+pinHash').lean();
      assert.notEqual(raw.tcHash, TEST_TC);
      assert.ok(!JSON.stringify(raw).includes(TEST_TC), 'TC hiçbir alanda açık hâlde yok');
      assert.ok(raw.pinHash.startsWith('scrypt$'));

      const again = await post('/customers/register', authBody(StellarSdk.Keypair.random()));
      assert.equal(again.status, 409);
    });

    it('kayıt: geçersiz TC, 6 hane olmayan PIN ve başkasının cüzdan imzası reddedilir', async () => {
      const kp = StellarSdk.Keypair.random();
      assert.equal((await post('/customers/register', authBody(kp, { tc: '12345678901' }))).status, 400);
      assert.equal((await post('/customers/register', authBody(kp, { pin: '12a456' }))).status, 400);
      const other = StellarSdk.Keypair.random();
      assert.equal((await post('/customers/register', { ...authBody(kp), address: other.publicKey() })).status, 403);
    });

    it('kayıt: ad soyad zorunlu ve temizlenerek saklanır', async () => {
      const kp = StellarSdk.Keypair.random();
      assert.equal((await post('/customers/register', authBody(kp, { fullName: '' }))).status, 400);
      assert.equal((await post('/customers/register', authBody(kp, { fullName: '12345' }))).status, 400);
      const res = await post('/customers/register', authBody(kp, { fullName: '  Ayşe   Nur  Yılmaz ' }));
      assert.equal(res.status, 201);
      assert.equal((await res.json()).fullName, 'Ayşe Nur Yılmaz');
      assert.equal((await Customer.findOne({})).fullName, 'Ayşe Nur Yılmaz');
    });

    it('profil: adı olmayan eski hesap cüzdan imzasıyla ad ekler; başkasının imzası ve kayıtsız cihaz reddedilir', async () => {
      const kp = StellarSdk.Keypair.random();
      await Customer.create({ tcHash: 'eski-hesap', pinHash: hashSecret(PIN), stellarAddress: kp.publicKey() });

      const other = StellarSdk.Keypair.random();
      assert.equal((await post('/customers/profile', profileBody(kp, 'Mustafa Demir', other))).status, 403);
      assert.equal((await post('/customers/profile', profileBody(kp, '!'))).status, 400);
      assert.equal((await post('/customers/profile', profileBody(other, 'Mustafa Demir'))).status, 404);

      const res = await post('/customers/profile', profileBody(kp, 'Mustafa Demir'));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { fullName: 'Mustafa Demir' });
      assert.equal((await Customer.findOne({})).fullName, 'Mustafa Demir');
    });

    it('ad soyad biçimi: Türkçe harfler, tire ve kesme kabul; rakam ve tek harf reddedilir', () => {
      assert.equal(normalizeFullName('Çağrı Öztürk-Şahin'), 'Çağrı Öztürk-Şahin');
      assert.equal(normalizeFullName("D'Souza"), "D'Souza");
      assert.equal(normalizeFullName('A'), null);
      assert.equal(normalizeFullName('Ali 2'), null);
      assert.equal(normalizeFullName(undefined), null);
    });

    it('aynı cihazdan giriş: taşıma yok', async () => {
      const kp = StellarSdk.Keypair.random();
      await post('/customers/register', authBody(kp));
      const res = await post('/customers/login', authBody(kp));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { address: kp.publicKey(), migratedAmount: null, fullName: NAME });
      assert.equal(chain.calls.length, 0);
    });

    it('yeni cihazdan giriş: eski cüzdandan yakılır, yeni cüzdana basılır, hesap yeni adrese geçer', async () => {
      const oldKp = StellarSdk.Keypair.random();
      const newKp = StellarSdk.Keypair.random();
      await post('/customers/register', authBody(oldKp));
      chain = fakeChain({ [oldKp.publicKey()]: '7500000000' });

      const res = await post('/customers/login', authBody(newKp));
      assert.equal(res.status, 200);
      assert.equal((await res.json()).migratedAmount, '7500000000');
      assert.deepEqual(chain.calls, [
        { method: 'burn', address: oldKp.publicKey(), amount: '7500000000' },
        { method: 'mint', address: newKp.publicKey(), amount: '7500000000' },
      ]);
      assert.equal((await Customer.findOne({})).stellarAddress, newKp.publicKey());
    });

    it('issuer-batch tanımlıysa yeni cihazda bakiye TEK işlemde taşınır', async () => {
      const oldKp = StellarSdk.Keypair.random();
      const newKp = StellarSdk.Keypair.random();
      await post('/customers/register', authBody(oldKp));
      chain = fakeChain({ [oldKp.publicKey()]: '7500000000' });
      const batches = [];
      chain.deps.issuerBatch = async (ops) => {
        batches.push(ops);
        return 'hash-batch';
      };

      const res = await post('/customers/login', authBody(newKp));
      assert.equal(res.status, 200);
      assert.equal((await res.json()).migratedAmount, '7500000000');
      assert.equal(chain.calls.length, 0, 'ayrı burn/mint gönderilmedi');
      assert.deepEqual(batches, [
        {
          burns: [{ address: oldKp.publicKey(), amount: '7500000000' }],
          mints: [{ address: newKp.publicKey(), amount: '7500000000' }],
        },
      ]);
      const saved = await Customer.findOne({});
      assert.equal(saved.stellarAddress, newKp.publicKey());
      assert.equal(saved.pendingMigration, undefined);
    });

    it('issuer-batch başarısızsa hesap eski adreste kalır, yarım taşıma kaydı doğmaz', async () => {
      const oldKp = StellarSdk.Keypair.random();
      const newKp = StellarSdk.Keypair.random();
      await post('/customers/register', authBody(oldKp));
      chain = fakeChain({ [oldKp.publicKey()]: '100' });
      chain.deps.issuerBatch = async () => {
        throw new Error('ağ hatası');
      };

      assert.equal((await post('/customers/login', authBody(newKp))).status, 500);
      const saved = await Customer.findOne({});
      assert.equal(saved.stellarAddress, oldKp.publicKey());
      assert.equal(saved.pendingMigration, undefined);
    });

    it('basma yarıda kalırsa yakılan tutar kaybolmaz: sonraki girişte basılır, tekrar yakılmaz', async () => {
      const oldKp = StellarSdk.Keypair.random();
      const newKp = StellarSdk.Keypair.random();
      await post('/customers/register', authBody(oldKp));
      let n = 0;
      chain = {
        calls: [],
        deps: {
          readBalance: async () => '100',
          issuerCall: async (method, address, amount) => {
            n += 1;
            chain.calls.push({ method, amount });
            if (method === 'mint' && n === 2) throw new Error('ağ hatası');
            return `h${n}`;
          },
        },
      };
      assert.equal((await post('/customers/login', authBody(newKp))).status, 500);
      assert.equal((await Customer.findOne({})).pendingMigration.amount, '100');

      const retry = await post('/customers/login', authBody(newKp));
      assert.equal(retry.status, 200);
      assert.deepEqual(chain.calls.map((c) => c.method), ['burn', 'mint', 'mint'], 'ikinci kez yakılmadı');
      const saved = await Customer.findOne({});
      assert.equal(saved.stellarAddress, newKp.publicKey());
      assert.equal(saved.pendingMigration, undefined);
    });

    it(`yanlış PIN ${MAX_FAILED_LOGINS} kez: hesap kilitlenir, doğru PIN de reddedilir`, async () => {
      const kp = StellarSdk.Keypair.random();
      await post('/customers/register', authBody(kp));
      for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
        assert.equal((await post('/customers/login', authBody(kp, { pin: '000000' }))).status, 401);
      }
      assert.equal((await post('/customers/login', authBody(kp))).status, 423);
    });

    it('olmayan TC ile giriş: aynı genel hata (hesabın varlığı sızmaz)', async () => {
      const res = await post('/customers/login', authBody(StellarSdk.Keypair.random()));
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, 'INVALID_CREDENTIALS');
    });
  });

  describe('esnaf', () => {
    async function merchantWithPassword(password = 'dukkan123') {
      return Merchant.create({
        businessName: 'Demo Kırtasiye',
        taxId: 'VKN-' + randomUUID().slice(0, 8),
        stellarAddress: StellarSdk.Keypair.random().publicKey(),
        apiKeyHash: hashApiKey('kayit-anahtari-' + randomUUID()),
        passwordHash: hashSecret(password),
        ownershipVerified: true,
        isActive: true,
      });
    }

    it('VKN + şifre ile giriş oturum anahtarı verir; anahtar yetkili uçlarda geçer', async () => {
      const m = await merchantWithPassword();
      const res = await post('/merchants/login', { taxId: m.taxId, password: 'dukkan123' });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.merchantId, m._id.toString());

      const who = await fetch(`${baseUrl}/whoami`, { headers: { Authorization: `Bearer ${body.apiKey}` } });
      assert.equal(who.status, 200);
      assert.equal((await who.json()).merchantId, m._id.toString());
    });

    it('iki cihazdan giriş: ikisinin oturumu da geçerli kalır', async () => {
      const m = await merchantWithPassword();
      const a = await (await post('/merchants/login', { taxId: m.taxId, password: 'dukkan123' })).json();
      const b = await (await post('/merchants/login', { taxId: m.taxId, password: 'dukkan123' })).json();
      for (const key of [a.apiKey, b.apiKey]) {
        assert.equal((await fetch(`${baseUrl}/whoami`, { headers: { Authorization: `Bearer ${key}` } })).status, 200);
      }
    });

    it('yanlış şifre 401; 5 hatada kilit; şifresi olmayan esnaf giriş yapamaz', async () => {
      const m = await merchantWithPassword();
      for (let i = 0; i < MAX_FAILED_LOGINS; i += 1) {
        assert.equal((await post('/merchants/login', { taxId: m.taxId, password: 'yanlis' })).status, 401);
      }
      assert.equal((await post('/merchants/login', { taxId: m.taxId, password: 'dukkan123' })).status, 423);

      const noPass = await Merchant.create({
        businessName: 'Eski', taxId: 'ESKI-1', stellarAddress: StellarSdk.Keypair.random().publicKey(),
        apiKeyHash: hashApiKey('x-' + randomUUID()), ownershipVerified: true, isActive: true,
      });
      assert.equal((await post('/merchants/login', { taxId: noPass.taxId, password: 'herhangi' })).status, 401);
    });
  });
});
