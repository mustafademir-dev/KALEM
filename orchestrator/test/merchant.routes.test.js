import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import Merchant from '../src/models/Merchant.model.js';
import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import { hashApiKey, buildMerchantOwnershipChallenge } from '../src/utils/crypto.js';
import { registerMerchant, getMerchantBalance } from '../src/api/routes/merchant.routes.js';

/** Gerçek bir Ed25519 keypair ile adres sahipliği kanıtı imzası üretir. */
function signOwnershipChallenge(keypair, taxId) {
  const challenge = buildMerchantOwnershipChallenge(taxId, keypair.publicKey());
  return keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');
}

function createMockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('Merchant Routes Unit Tests', () => {
  describe('registerMerchant', () => {
    it('taxId veya stellarAddress zaten kayıtlıysa 409 döndürmelidir', async () => {
      const originalFindOne = Merchant.findOne;
      Merchant.findOne = async () => ({ _id: 'existing' });

      const req = {
        body: { businessName: 'Test Ticaret', taxId: '1234567890', stellarAddress: 'GABC...' },
      };
      const res = createMockRes();

      try {
        await registerMerchant(req, res);
        assert.equal(res.statusCode, 409);
        assert.equal(res.body.error, 'ALREADY_REGISTERED');
      } finally {
        Merchant.findOne = originalFindOne;
      }
    });

    it('yeni kayıt oluşturmalı, apiKeyHash saklamalı, ownershipVerified:true işaretlemeli ve plaintext apiKey\'i bir kez döndürmelidir', async () => {
      const originalFindOne = Merchant.findOne;
      const originalCreate = Merchant.create;

      Merchant.findOne = async () => null;
      let createdDoc = null;
      Merchant.create = async (doc) => {
        createdDoc = doc;
        return { _id: { toString: () => '507f1f77bcf86cd799439011' }, businessName: doc.businessName, kycStatus: 'pending' };
      };

      const kp = StellarSdk.Keypair.random();
      const taxId = '1234567890';
      const req = {
        body: {
          businessName: 'Test Ticaret',
          taxId,
          stellarAddress: kp.publicKey(),
          signature: signOwnershipChallenge(kp, taxId),
          email: 'test@example.com',
        },
      };
      const res = createMockRes();

      try {
        await registerMerchant(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.body.merchantId, '507f1f77bcf86cd799439011');
        assert.equal(res.body.kycStatus, 'pending');
        assert.ok(typeof res.body.apiKey === 'string' && res.body.apiKey.length === 64, 'apiKey plaintext döndürülmelidir');

        // Saklanan hash, döndürülen plaintext anahtarın SHA-256 hash'i ile eşleşmelidir.
        assert.equal(createdDoc.apiKeyHash, hashApiKey(res.body.apiKey));
        assert.notEqual(createdDoc.apiKeyHash, res.body.apiKey, 'Plaintext anahtar DB dokümanına yazılmamalıdır');
        assert.equal(createdDoc.ownershipVerified, true);
      } finally {
        Merchant.findOne = originalFindOne;
        Merchant.create = originalCreate;
      }
    });

    it('signature stellarAddress ile eşleşmiyorsa (yanlış anahtarla imzalanmışsa) 403 döndürmelidir', async () => {
      const originalFindOne = Merchant.findOne;
      Merchant.findOne = async () => null;

      const claimedKp = StellarSdk.Keypair.random(); // stellarAddress olarak iddia edilen
      const wrongKp = StellarSdk.Keypair.random(); // gerçekte imzalayan (başka bir anahtar)
      const taxId = '1234567890';

      const req = {
        body: {
          businessName: 'Test Ticaret',
          taxId,
          stellarAddress: claimedKp.publicKey(),
          signature: signOwnershipChallenge(wrongKp, taxId), // yanlış anahtarla imzalandı
        },
      };
      const res = createMockRes();

      try {
        await registerMerchant(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.error, 'OWNERSHIP_PROOF_FAILED');
      } finally {
        Merchant.findOne = originalFindOne;
      }
    });

    it('MongoDB E11000 duplicate key hatasında 409 döndürmelidir (race condition)', async () => {
      const originalFindOne = Merchant.findOne;
      const originalCreate = Merchant.create;

      Merchant.findOne = async () => null;
      Merchant.create = async () => {
        const err = new Error('duplicate key');
        err.code = 11000;
        throw err;
      };

      const kp = StellarSdk.Keypair.random();
      const taxId = '1234567890';
      const req = {
        body: {
          businessName: 'Test Ticaret',
          taxId,
          stellarAddress: kp.publicKey(),
          signature: signOwnershipChallenge(kp, taxId),
        },
      };
      const res = createMockRes();

      try {
        await registerMerchant(req, res);
        assert.equal(res.statusCode, 409);
      } finally {
        Merchant.findOne = originalFindOne;
        Merchant.create = originalCreate;
      }
    });
  });

  describe('getMerchantBalance', () => {
    it('geçersiz merchant id 400 döndürmelidir', async () => {
      const req = { params: { id: 'not-an-object-id' }, merchantId: 'not-an-object-id' };
      const res = createMockRes();
      await getMerchantBalance(req, res);
      assert.equal(res.statusCode, 400);
    });

    it('kimlik doğrulanan merchant başka bir id sorgularsa 403 döndürmelidir', async () => {
      const req = {
        params: { id: '507f1f77bcf86cd799439011' },
        merchantId: '507f1f77bcf86cd799439022',
      };
      const res = createMockRes();
      await getMerchantBalance(req, res);
      assert.equal(res.statusCode, 403);
    });

    it('üye işyeri bulunamazsa 404 döndürmelidir', async () => {
      const originalFindById = Merchant.findById;
      Merchant.findById = async () => null;

      const id = '507f1f77bcf86cd799439011';
      const req = { params: { id }, merchantId: id };
      const res = createMockRes();

      try {
        await getMerchantBalance(req, res);
        assert.equal(res.statusCode, 404);
      } finally {
        Merchant.findById = originalFindById;
      }
    });

    it('Soroban simülasyonundan okunan bakiyeyi döndürmelidir', async () => {
      const originalFindById = Merchant.findById;
      const originalSoroban = stellarConfig.sorobanServer;
      const originalDtlId = config.contracts.dtlTokenId;

      const id = '507f1f77bcf86cd799439011';
      const stellarAddress = StellarSdk.Keypair.random().publicKey();
      config.contracts.dtlTokenId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

      Merchant.findById = async () => ({ _id: { toString: () => id }, stellarAddress });
      stellarConfig.sorobanServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: { retval: StellarSdk.nativeToScVal('95600000', { type: 'i128' }) },
        }),
      };

      const req = { params: { id }, merchantId: id };
      const res = createMockRes();

      try {
        await getMerchantBalance(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.merchantId, id);
        assert.equal(res.body.stellarAddress, stellarAddress);
        assert.equal(res.body.balance, '95600000');
        assert.equal(res.body.currency, 'dTL');
      } finally {
        Merchant.findById = originalFindById;
        stellarConfig.sorobanServer = originalSoroban;
        config.contracts.dtlTokenId = originalDtlId;
      }
    });

    it('Soroban simülasyonu başarısız olursa 502 döndürmelidir', async () => {
      const originalFindById = Merchant.findById;
      const originalSoroban = stellarConfig.sorobanServer;
      const originalDtlId = config.contracts.dtlTokenId;

      const id = '507f1f77bcf86cd799439011';
      const stellarAddress = StellarSdk.Keypair.random().publicKey();
      config.contracts.dtlTokenId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

      Merchant.findById = async () => ({ _id: { toString: () => id }, stellarAddress });
      stellarConfig.sorobanServer = {
        simulateTransaction: async () => ({ error: 'HostError' }),
      };

      const req = { params: { id }, merchantId: id };
      const res = createMockRes();

      try {
        await getMerchantBalance(req, res);
        assert.equal(res.statusCode, 502);
      } finally {
        Merchant.findById = originalFindById;
        stellarConfig.sorobanServer = originalSoroban;
        config.contracts.dtlTokenId = originalDtlId;
      }
    });
  });
});
