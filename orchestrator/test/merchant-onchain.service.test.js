import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import {
  registerMerchantOnChain,
  isMerchantAlreadyRegistered,
} from '../src/services/merchant-onchain.service.js';

describe('MerchantOnChain Service Unit Tests', () => {
  const dummyContractId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

  describe('registerMerchantOnChain', () => {
    it('geçersiz bir esnaf adresi verilirse ağa hiç gitmeden fırlatmalıdır', async () => {
      await assert.rejects(() => registerMerchantOnChain('gecersiz-adres'), /Geçersiz esnaf adresi/);
    });

    it('ISSUER_SECRET_KEY yapılandırılmamışsa fırlatmalıdır', async () => {
      const originalSecret = config.secrets.issuerSecretKey;
      config.secrets.issuerSecretKey = '';

      try {
        const merchantAddr = StellarSdk.Keypair.random().publicKey();
        await assert.rejects(() => registerMerchantOnChain(merchantAddr), /İhraççı gizli anahtarı/);
      } finally {
        config.secrets.issuerSecretKey = originalSecret;
      }
    });

    it('register_merchant çağrısını doğru argümanlarla kurmalı, ihraççı ile imzalamalı ve ağa göndermelidir', async () => {
      const originalHorizon = stellarConfig.horizonServer;
      const originalSoroban = stellarConfig.sorobanServer;
      const originalIssuerSecret = config.secrets.issuerSecretKey;
      const originalDtlId = config.contracts.dtlTokenId;

      const issuerKp = StellarSdk.Keypair.random();
      const merchantAddr = StellarSdk.Keypair.random().publicKey();
      config.secrets.issuerSecretKey = issuerKp.secret();
      config.contracts.dtlTokenId = dummyContractId;

      stellarConfig.horizonServer = {
        loadAccount: async () => new StellarSdk.Account(issuerKp.publicKey(), '100'),
        submitTransaction: async (tx) => {
          assert.ok(tx instanceof StellarSdk.Transaction);
          assert.equal(tx.source, issuerKp.publicKey());
          return { hash: 'registerhash123' };
        },
      };
      stellarConfig.sorobanServer = {
        prepareTransaction: async (rawTx) => rawTx,
      };

      try {
        const hash = await registerMerchantOnChain(merchantAddr);
        assert.equal(hash, 'registerhash123');
      } finally {
        stellarConfig.horizonServer = originalHorizon;
        stellarConfig.sorobanServer = originalSoroban;
        config.secrets.issuerSecretKey = originalIssuerSecret;
        config.contracts.dtlTokenId = originalDtlId;
      }
    });
  });

  describe('isMerchantAlreadyRegistered', () => {
    it('config.contracts.dtlTokenId ile isMerchantOnChain sonucunu döndürmelidir', async () => {
      const originalSoroban = stellarConfig.sorobanServer;
      const originalDtlId = config.contracts.dtlTokenId;
      config.contracts.dtlTokenId = dummyContractId;

      let capturedContractId = null;
      stellarConfig.sorobanServer = {
        simulateTransaction: async (tx) => {
          const invoked = tx.operations[0].func.invokeContract().contractAddress();
          capturedContractId = StellarSdk.Address.fromScAddress(invoked).toString();
          return { transactionData: {}, result: { retval: StellarSdk.nativeToScVal(true, { type: 'bool' }) } };
        },
      };

      try {
        const result = await isMerchantAlreadyRegistered(StellarSdk.Keypair.random().publicKey());
        assert.equal(result, true);
        assert.equal(capturedContractId, dummyContractId);
      } finally {
        stellarConfig.sorobanServer = originalSoroban;
        config.contracts.dtlTokenId = originalDtlId;
      }
    });
  });
});
