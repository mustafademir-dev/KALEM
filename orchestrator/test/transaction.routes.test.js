import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import Transaction from '../src/models/Transaction.model.js';
import Merchant from '../src/models/Merchant.model.js';
import IdempotencyKey from '../src/models/IdempotencyKey.model.js';
import { submitTransactionHandler, getTransactionStatus } from '../src/api/routes/transaction.routes.js';

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

describe('Transaction Routes Unit Tests', () => {
  const dummyContractId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

  const merchantAddress = StellarSdk.Keypair.random().publicKey();

  /** İmzalı `pay_merchant(from, merchantAddress, 10000000)` iç zarfı — gerçek ödemenin biçimi. */
  const buildSignedInnerXdr = (keypair, contractId = dummyContractId) => {
    const account = new StellarSdk.Account(keypair.publicKey(), '100');
    const contract = new StellarSdk.Contract(contractId);
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'pay_merchant',
          StellarSdk.Address.fromString(keypair.publicKey()).toScVal(),
          StellarSdk.Address.fromString(merchantAddress).toScVal(),
          StellarSdk.nativeToScVal(10000000n, { type: 'i128' })
        )
      )
      .setTimeout(300)
      .build();
    tx.sign(keypair);
    return tx;
  };

  describe('submitTransactionHandler', () => {
    it('req.merchantId ile body.merchantId uyuşmazsa 403 döndürmeli ve idempotency kaydını failed yapmalıdır', async () => {
      const originalUpdateOne = IdempotencyKey.updateOne;
      let captured = null;
      IdempotencyKey.updateOne = async (filter, update) => {
        captured = { filter, update };
        return {};
      };

      const req = {
        body: { signedXdr: 'irrelevant', merchantId: '507f1f77bcf86cd799439011', totalAmount: '100' },
        merchantId: '507f1f77bcf86cd799439099',
        idempotencyKey: 'key-forbidden',
      };
      const res = createMockRes();

      try {
        await submitTransactionHandler(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(captured.filter.key, 'key-forbidden');
        assert.equal(captured.update.$set.status, 'failed');
      } finally {
        IdempotencyKey.updateOne = originalUpdateOne;
      }
    });

    it('signedXdr ayrıştırılamazsa 400 döndürmelidir', async () => {
      const originalUpdateOne = IdempotencyKey.updateOne;
      IdempotencyKey.updateOne = async () => ({});

      const req = {
        body: { signedXdr: 'gecersiz-xdr', merchantId: '507f1f77bcf86cd799439011', totalAmount: '100' },
        merchantId: '507f1f77bcf86cd799439011',
        idempotencyKey: 'key-badxdr',
      };
      const res = createMockRes();

      try {
        await submitTransactionHandler(req, res);
        assert.equal(res.statusCode, 400);
      } finally {
        IdempotencyKey.updateOne = originalUpdateOne;
      }
    });

    it('başarılı akışta 201 dönmeli, Transaction submitted olmalı ve idempotency completed kapatılmalıdır', async () => {
      const senderKp = StellarSdk.Keypair.random();
      const pool2Kp = StellarSdk.Keypair.random();
      const innerTx = buildSignedInnerXdr(senderKp);
      const signedXdr = innerTx.toXDR();

      const originalSoroban = stellarConfig.sorobanServer;
      const originalHorizon = stellarConfig.horizonServer;
      const originalSecret = config.secrets.pool2SecretKey;
      const originalPool2Addr = config.pools.pool2Address;
      const originalAllowed = config.feeBump.allowedContractIds;
      const originalCreate = Transaction.create;
      const originalUpdateOne = IdempotencyKey.updateOne;
      const originalFindById = Merchant.findById;
      Merchant.findById = () => ({ select: () => ({ lean: async () => ({ stellarAddress: merchantAddress }) }) });

      stellarConfig.sorobanServer = { simulateTransaction: async () => ({ transactionData: {} }) };
      stellarConfig.horizonServer = {
        submitTransaction: async () => ({ hash: 'submithash123', ledger: 555 }),
      };
      config.secrets.pool2SecretKey = pool2Kp.secret();
      config.pools.pool2Address = pool2Kp.publicKey();
      config.feeBump.allowedContractIds = [dummyContractId];

      const txInstance = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        save: async function () {},
      };
      Transaction.create = async (doc) => {
        Object.assign(txInstance, doc);
        return txInstance;
      };

      let idempotencyUpdate = null;
      IdempotencyKey.updateOne = async (filter, update) => {
        idempotencyUpdate = { filter, update };
        return {};
      };

      const req = {
        body: { signedXdr, merchantId: '507f1f77bcf86cd799439022', totalAmount: '10000000' },
        merchantId: '507f1f77bcf86cd799439022',
        idempotencyKey: 'key-success',
      };
      const res = createMockRes();

      try {
        await submitTransactionHandler(req, res);

        assert.equal(res.statusCode, 201);
        assert.equal(res.body.transactionId, '507f1f77bcf86cd799439011');
        assert.equal(res.body.status, 'submitted');
        assert.equal(txInstance.status, 'submitted');
        assert.equal(txInstance.txHash, 'submithash123');
        assert.equal(idempotencyUpdate.filter.key, 'key-success');
        assert.equal(idempotencyUpdate.update.$set.status, 'completed');
        assert.equal(idempotencyUpdate.update.$set.result.transactionId, '507f1f77bcf86cd799439011');
      } finally {
        stellarConfig.sorobanServer = originalSoroban;
        stellarConfig.horizonServer = originalHorizon;
        config.secrets.pool2SecretKey = originalSecret;
        config.pools.pool2Address = originalPool2Addr;
        config.feeBump.allowedContractIds = originalAllowed;
        Transaction.create = originalCreate;
        IdempotencyKey.updateOne = originalUpdateOne;
        Merchant.findById = originalFindById;
      }
    });

    it('fee-bump başarısız olursa 502 dönmeli, Transaction failed olmalı ve idempotency failed kapatılmalıdır', async () => {
      const senderKp = StellarSdk.Keypair.random();
      const innerTx = buildSignedInnerXdr(senderKp);
      const signedXdr = innerTx.toXDR();

      const originalSoroban = stellarConfig.sorobanServer;
      const originalAllowed = config.feeBump.allowedContractIds;
      const originalCreate = Transaction.create;
      const originalUpdateOne = IdempotencyKey.updateOne;
      const originalFindById = Merchant.findById;
      Merchant.findById = () => ({ select: () => ({ lean: async () => ({ stellarAddress: merchantAddress }) }) });

      // Ön-simülasyon başarısız -> wrapAndSubmitFeeBump içeride fırlatır, Havuz 2 hiç imzalamaz.
      stellarConfig.sorobanServer = { simulateTransaction: async () => ({ error: 'HostError' }) };
      config.feeBump.allowedContractIds = [dummyContractId];

      let savedStatus = null;
      const txInstance = {
        _id: { toString: () => '507f1f77bcf86cd799439033' },
        save: async function () {
          savedStatus = this.status;
        },
      };
      Transaction.create = async (doc) => {
        Object.assign(txInstance, doc);
        return txInstance;
      };

      let idempotencyUpdate = null;
      IdempotencyKey.updateOne = async (filter, update) => {
        idempotencyUpdate = { filter, update };
        return {};
      };

      const req = {
        body: { signedXdr, merchantId: '507f1f77bcf86cd799439044', totalAmount: '10000000' },
        merchantId: '507f1f77bcf86cd799439044',
        idempotencyKey: 'key-feebump-fail',
      };
      const res = createMockRes();

      try {
        await submitTransactionHandler(req, res);
        assert.equal(res.statusCode, 502);
        assert.equal(savedStatus, 'failed');
        assert.equal(idempotencyUpdate.filter.key, 'key-feebump-fail');
        assert.equal(idempotencyUpdate.update.$set.status, 'failed');
      } finally {
        stellarConfig.sorobanServer = originalSoroban;
        config.feeBump.allowedContractIds = originalAllowed;
        Transaction.create = originalCreate;
        IdempotencyKey.updateOne = originalUpdateOne;
        Merchant.findById = originalFindById;
      }
    });
  });

  describe('getTransactionStatus', () => {
    it('işlem bulunamazsa 404 döndürmelidir', async () => {
      const originalFindOne = Transaction.findOne;
      Transaction.findOne = async () => null;

      const req = { params: { txHash: 'yok-boyle-bir-hash' }, merchantId: '507f1f77bcf86cd799439011' };
      const res = createMockRes();

      try {
        await getTransactionStatus(req, res);
        assert.equal(res.statusCode, 404);
      } finally {
        Transaction.findOne = originalFindOne;
      }
    });

    it('başka bir işyerinin işlemini sorgularsa 403 döndürmelidir', async () => {
      const originalFindOne = Transaction.findOne;
      Transaction.findOne = async () => ({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        merchantId: { toString: () => '507f1f77bcf86cd799439099' },
        txHash: 'hash-1',
        status: 'submitted',
      });

      const req = { params: { txHash: 'hash-1' }, merchantId: '507f1f77bcf86cd799439011' };
      const res = createMockRes();

      try {
        await getTransactionStatus(req, res);
        assert.equal(res.statusCode, 403);
      } finally {
        Transaction.findOne = originalFindOne;
      }
    });

    it('kendi işlemi için durum bilgisini 200 ile döndürmelidir', async () => {
      const originalFindOne = Transaction.findOne;
      Transaction.findOne = async () => ({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        merchantId: { toString: () => '507f1f77bcf86cd799439011' },
        txHash: 'hash-2',
        status: 'confirmed',
        totalAmount: '10000000',
        ledgerNumber: 4109850,
      });

      const req = { params: { txHash: 'hash-2' }, merchantId: '507f1f77bcf86cd799439011' };
      const res = createMockRes();

      try {
        await getTransactionStatus(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, 'confirmed');
        assert.equal(res.body.ledgerNumber, 4109850);
      } finally {
        Transaction.findOne = originalFindOne;
      }
    });
  });
});
