import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import Merchant from '../src/models/Merchant.model.js';
import MerchantApproval from '../src/models/MerchantApproval.model.js';
import { parseArgs, approveMerchant } from '../scripts/approve-merchant.mjs';

function makeMerchantDoc(overrides = {}) {
  const doc = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    businessName: 'Test Ticaret',
    taxId: '1234567890',
    stellarAddress: StellarSdk.Keypair.random().publicKey(),
    ownershipVerified: true,
    onChainRegistered: false,
    kycStatus: 'pending',
    save: async function () {},
    ...overrides,
  };
  return doc;
}

describe('approve-merchant.mjs Unit Tests', () => {
  describe('parseArgs', () => {
    it('--key=value argümanlarını ayrıştırmalıdır', () => {
      const args = parseArgs(['--taxId=123456', '--operator=Mustafa Demir']);
      assert.deepEqual(args, { taxId: '123456', operator: 'Mustafa Demir' });
    });

    it('tanınmayan argümanları yok saymalıdır', () => {
      const args = parseArgs(['node', 'script.mjs', '--taxId=1']);
      assert.deepEqual(args, { taxId: '1' });
    });
  });

  describe('approveMerchant', () => {
    it('taxId eksikse fırlatmalıdır', async () => {
      await assert.rejects(() => approveMerchant({ operator: 'op' }), /--taxId zorunludur/);
    });

    it('operator eksikse fırlatmalıdır', async () => {
      await assert.rejects(() => approveMerchant({ taxId: '123' }), /--operator zorunludur/);
    });

    it('üye işyeri bulunamazsa fırlatmalıdır', async () => {
      const originalFindOne = Merchant.findOne;
      Merchant.findOne = async () => null;
      try {
        await assert.rejects(
          () => approveMerchant({ taxId: '999', operator: 'op' }),
          /Üye işyeri bulunamadı/
        );
      } finally {
        Merchant.findOne = originalFindOne;
      }
    });

    it('ownershipVerified false ise REDDETMELİ ve zincire hiç gitmemelidir', async () => {
      const originalFindOne = Merchant.findOne;
      const originalApprovalCreate = MerchantApproval.create;

      const merchant = makeMerchantDoc({ ownershipVerified: false });
      Merchant.findOne = async () => merchant;

      let approvalCreated = null;
      MerchantApproval.create = async (doc) => {
        approvalCreated = doc;
        return { ...doc, save: async () => {} };
      };

      try {
        const result = await approveMerchant({ taxId: merchant.taxId, operator: 'op' });
        assert.equal(result.status, 'failed');
        assert.equal(approvalCreated.status, 'failed');
        assert.match(approvalCreated.errorMessage, /ownershipVerified=false/);
      } finally {
        Merchant.findOne = originalFindOne;
        MerchantApproval.create = originalApprovalCreate;
      }
    });

    it('zaten on-chain kayıtlıysa idempotent davranmalı ve İKİNCİ BİR TX GÖNDERMEMELİDİR', async () => {
      const originalFindOne = Merchant.findOne;
      const originalApprovalCreate = MerchantApproval.create;
      const originalSoroban = stellarConfig.sorobanServer;
      const originalDtlId = config.contracts.dtlTokenId;

      config.contracts.dtlTokenId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';
      let savedMerchant = false;
      const merchant = makeMerchantDoc({
        onChainRegistered: false,
        save: async function () {
          savedMerchant = true;
        },
      });
      Merchant.findOne = async () => merchant;

      let approvalCreated = null;
      MerchantApproval.create = async (doc) => {
        approvalCreated = doc;
        return { ...doc, save: async () => {} };
      };

      // Zincir: is_merchant -> true (zaten kayıtlı). submitTransaction TANIMLANMADI
      // — eğer kod yanlışlıkla bir tx göndermeye çalışırsa test bunu patlatarak yakalar.
      stellarConfig.sorobanServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: { retval: StellarSdk.nativeToScVal(true, { type: 'bool' }) },
        }),
      };

      try {
        const result = await approveMerchant({ taxId: merchant.taxId, operator: 'op' });
        assert.equal(result.status, 'already_registered');
        assert.equal(savedMerchant, true, 'Merchant.onChainRegistered senkronize edilmeli');
        assert.equal(merchant.onChainRegistered, true);
        assert.equal(approvalCreated.status, 'already_registered');
      } finally {
        Merchant.findOne = originalFindOne;
        MerchantApproval.create = originalApprovalCreate;
        stellarConfig.sorobanServer = originalSoroban;
        config.contracts.dtlTokenId = originalDtlId;
      }
    });

    it('başarılı akışta Merchant.kycStatus/onChainRegistered güncellenmeli ve MerchantApproval completed olmalıdır', async () => {
      const originalFindOne = Merchant.findOne;
      const originalApprovalCreate = MerchantApproval.create;
      const originalHorizon = stellarConfig.horizonServer;
      const originalSoroban = stellarConfig.sorobanServer;
      const originalIssuerSecret = config.secrets.issuerSecretKey;
      const originalDtlId = config.contracts.dtlTokenId;

      const issuerKp = StellarSdk.Keypair.random();
      config.secrets.issuerSecretKey = issuerKp.secret();
      config.contracts.dtlTokenId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

      const merchant = makeMerchantDoc();
      Merchant.findOne = async () => merchant;

      const approvalInstance = { status: 'pending', save: async () => {} };
      MerchantApproval.create = async (doc) => {
        Object.assign(approvalInstance, doc);
        return approvalInstance;
      };

      let simulateCallCount = 0;
      stellarConfig.sorobanServer = {
        simulateTransaction: async () => {
          simulateCallCount += 1;
          return { transactionData: {}, result: { retval: StellarSdk.nativeToScVal(false, { type: 'bool' }) } };
        },
        prepareTransaction: async (rawTx) => rawTx,
      };
      stellarConfig.horizonServer = {
        loadAccount: async () => new StellarSdk.Account(issuerKp.publicKey(), '100'),
        submitTransaction: async () => ({ hash: 'approvehash123' }),
      };

      try {
        const result = await approveMerchant({ taxId: merchant.taxId, operator: 'test-operator' });

        assert.equal(simulateCallCount, 1, 'Önce zincir durumu bir kez sorgulanmalı (idempotent kontrol)');
        assert.equal(result.status, 'completed');
        assert.equal(result.registerTxHash, 'approvehash123');
        assert.equal(merchant.kycStatus, 'verified');
        assert.equal(merchant.onChainRegistered, true);
        assert.equal(approvalInstance.status, 'completed');
        assert.equal(approvalInstance.registerTxHash, 'approvehash123');
      } finally {
        Merchant.findOne = originalFindOne;
        MerchantApproval.create = originalApprovalCreate;
        stellarConfig.horizonServer = originalHorizon;
        stellarConfig.sorobanServer = originalSoroban;
        config.secrets.issuerSecretKey = originalIssuerSecret;
        config.contracts.dtlTokenId = originalDtlId;
      }
    });

    it('on-chain kayıt başarısız olursa MerchantApproval failed olmalı ve hata yeniden fırlatılmalıdır', async () => {
      const originalFindOne = Merchant.findOne;
      const originalApprovalCreate = MerchantApproval.create;
      const originalHorizon = stellarConfig.horizonServer;
      const originalSoroban = stellarConfig.sorobanServer;
      const originalIssuerSecret = config.secrets.issuerSecretKey;
      const originalDtlId = config.contracts.dtlTokenId;

      const issuerKp = StellarSdk.Keypair.random();
      config.secrets.issuerSecretKey = issuerKp.secret();
      config.contracts.dtlTokenId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

      const merchant = makeMerchantDoc();
      Merchant.findOne = async () => merchant;

      const approvalInstance = { status: 'pending', save: async () => {} };
      MerchantApproval.create = async (doc) => {
        Object.assign(approvalInstance, doc);
        return approvalInstance;
      };

      stellarConfig.sorobanServer = {
        simulateTransaction: async () => ({
          transactionData: {},
          result: { retval: StellarSdk.nativeToScVal(false, { type: 'bool' }) },
        }),
        prepareTransaction: async () => {
          throw new Error('RPC bağlantı hatası');
        },
      };
      stellarConfig.horizonServer = {
        loadAccount: async () => new StellarSdk.Account(issuerKp.publicKey(), '100'),
      };

      try {
        await assert.rejects(
          () => approveMerchant({ taxId: merchant.taxId, operator: 'test-operator' }),
          /RPC bağlantı hatası/
        );
        assert.equal(approvalInstance.status, 'failed');
        assert.match(approvalInstance.errorMessage, /RPC bağlantı hatası/);
        assert.equal(merchant.kycStatus, 'pending', 'Başarısız denemede Merchant güncellenmemeli');
      } finally {
        Merchant.findOne = originalFindOne;
        MerchantApproval.create = originalApprovalCreate;
        stellarConfig.horizonServer = originalHorizon;
        stellarConfig.sorobanServer = originalSoroban;
        config.secrets.issuerSecretKey = originalIssuerSecret;
        config.contracts.dtlTokenId = originalDtlId;
      }
    });
  });
});
