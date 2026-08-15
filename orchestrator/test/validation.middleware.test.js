import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import stellarConfig from '../src/config/stellar.js';
import {
  validateTransactionSubmit,
  validateMerchantRegister,
} from '../src/api/middleware/validation.middleware.js';

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

/** Test için imzalı, tek operasyonlu bir iç zarf XDR'ı üretir. */
function buildSignedXdr() {
  const kp = StellarSdk.Keypair.random();
  const account = new StellarSdk.Account(kp.publicKey(), '100');
  const contract = new StellarSdk.Contract('CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4');
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: stellarConfig.networkPassphrase,
  })
    .addOperation(contract.call('balance', StellarSdk.Address.fromString(kp.publicKey()).toScVal()))
    .setTimeout(300)
    .build();
  tx.sign(kp);
  return tx.toXDR();
}

describe('Validation Middleware Unit Tests', () => {
  describe('validateTransactionSubmit', () => {
    const validMerchantId = '507f1f77bcf86cd799439011';

    it('signedXdr eksikse 400 döndürmelidir', () => {
      const req = { body: { merchantId: validMerchantId, totalAmount: '100' } };
      const res = createMockRes();
      let nextCalled = false;
      validateTransactionSubmit(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('geçersiz (parse edilemeyen) signedXdr 400 döndürmelidir', () => {
      const req = { body: { signedXdr: 'gecerli-olmayan-xdr', merchantId: validMerchantId, totalAmount: '100' } };
      const res = createMockRes();
      let nextCalled = false;
      validateTransactionSubmit(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('geçersiz merchantId (ObjectId olmayan) 400 döndürmelidir', () => {
      const req = { body: { signedXdr: buildSignedXdr(), merchantId: 'not-an-object-id', totalAmount: '100' } };
      const res = createMockRes();
      let nextCalled = false;
      validateTransactionSubmit(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('sıfır totalAmount 400 döndürmelidir', () => {
      const req = { body: { signedXdr: buildSignedXdr(), merchantId: validMerchantId, totalAmount: '0' } };
      const res = createMockRes();
      let nextCalled = false;
      validateTransactionSubmit(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('sayısal olmayan totalAmount 400 döndürmelidir', () => {
      const req = { body: { signedXdr: buildSignedXdr(), merchantId: validMerchantId, totalAmount: '12.5' } };
      const res = createMockRes();
      let nextCalled = false;
      validateTransactionSubmit(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('cartItems dizi değilse 400 döndürmelidir', () => {
      const req = {
        body: {
          signedXdr: buildSignedXdr(),
          merchantId: validMerchantId,
          totalAmount: '100',
          cartItems: 'dizi-degil',
        },
      };
      const res = createMockRes();
      let nextCalled = false;
      validateTransactionSubmit(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('geçerli girdi ile next() ÇAĞRILMALIDIR', () => {
      const req = {
        body: {
          signedXdr: buildSignedXdr(),
          merchantId: validMerchantId,
          totalAmount: '10000000',
          cartItems: [{ name: 'Ürün A', quantity: 1, price: '5000000', vatRate: 20 }],
        },
      };
      const res = createMockRes();
      let nextCalled = false;
      validateTransactionSubmit(req, res, () => (nextCalled = true));
      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, null);
    });
  });

  describe('validateMerchantRegister', () => {
    const validAddress = StellarSdk.Keypair.random().publicKey();

    it('businessName eksikse 400 döndürmelidir', () => {
      const req = { body: { taxId: '1234567890', stellarAddress: validAddress } };
      const res = createMockRes();
      let nextCalled = false;
      validateMerchantRegister(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('taxId eksikse 400 döndürmelidir', () => {
      const req = { body: { businessName: 'Test Ticaret', stellarAddress: validAddress } };
      const res = createMockRes();
      let nextCalled = false;
      validateMerchantRegister(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('geçersiz stellarAddress 400 döndürmelidir', () => {
      const req = { body: { businessName: 'Test Ticaret', taxId: '1234567890', stellarAddress: 'gecersiz' } };
      const res = createMockRes();
      let nextCalled = false;
      validateMerchantRegister(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('email string değilse 400 döndürmelidir', () => {
      const req = {
        body: { businessName: 'Test Ticaret', taxId: '1234567890', stellarAddress: validAddress, email: 12345 },
      };
      const res = createMockRes();
      let nextCalled = false;
      validateMerchantRegister(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('signature eksikse 400 döndürmelidir (v2 — adres sahipliği kanıtı zorunlu)', () => {
      const req = {
        body: { businessName: 'Test Ticaret', taxId: '9876543210', stellarAddress: validAddress },
      };
      const res = createMockRes();
      let nextCalled = false;
      validateMerchantRegister(req, res, () => (nextCalled = true));
      assert.equal(res.statusCode, 400);
      assert.equal(nextCalled, false);
    });

    it('geçerli girdi ile next() ÇAĞRILMALIDIR', () => {
      const req = {
        body: {
          businessName: 'Test Ticaret',
          taxId: '9876543210',
          stellarAddress: validAddress,
          signature: 'ZmFrZS1zaWduYXR1cmU=',
          email: 'test@example.com',
          phone: '+905551112233',
        },
      };
      const res = createMockRes();
      let nextCalled = false;
      validateMerchantRegister(req, res, () => (nextCalled = true));
      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, null);
    });
  });
});
