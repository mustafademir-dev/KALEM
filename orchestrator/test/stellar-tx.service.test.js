import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import stellarConfig from '../src/config/stellar.js';
import {
  loadAccount,
  buildContractCall,
  submitTransaction,
  readContractBalance,
} from '../src/services/stellar-tx.service.js';

describe('StellarTx Service Unit Tests', () => {
  const dummyAddress = 'GAAAUEICPJWHDM23K3RG7HPUFKGZGWXQIPQ5ER76DLD4OJ5UNLX6T6K4';
  const dummyContractId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

  it('loadAccount: Horizon sunucusu üzerinden hesap bilgilerini çekmelidir', async () => {
    const mockAccount = new StellarSdk.Account(dummyAddress, '100');
    const originalHorizon = stellarConfig.horizonServer;

    stellarConfig.horizonServer = {
      loadAccount: async (addr) => {
        assert.equal(addr, dummyAddress);
        return mockAccount;
      },
    };

    try {
      const result = await loadAccount(dummyAddress);
      assert.equal(result.accountId(), dummyAddress);
      assert.equal(result.sequenceNumber(), '100');
    } finally {
      stellarConfig.horizonServer = originalHorizon;
    }
  });

  it('buildContractCall: prepareTransaction (simulate + assemble) adımını ÇALIŞTIRMALIDIR', async () => {
    const mockAccount = new StellarSdk.Account(dummyAddress, '100');
    const originalHorizon = stellarConfig.horizonServer;
    const originalSoroban = stellarConfig.sorobanServer;

    let prepareTransactionCalled = false;

    stellarConfig.horizonServer = {
      loadAccount: async () => mockAccount,
    };

    stellarConfig.sorobanServer = {
      prepareTransaction: async (rawTx) => {
        prepareTransactionCalled = true;
        assert.ok(rawTx instanceof StellarSdk.Transaction, 'rawTx bir Transaction nesnesi olmalıdır');
        return rawTx; // Simülasyondan dönmüş gibi tx nesnesini döndürüyoruz
      },
    };

    try {
      const xdr = await buildContractCall({
        sourceAddress: dummyAddress,
        contractId: dummyContractId,
        method: 'test_func',
        args: [],
      });

      assert.ok(typeof xdr === 'string', 'Dönen XDR string olmalıdır');
      assert.equal(prepareTransactionCalled, true, 'prepareTransaction adımı KESİNLİKLE çağrılmış olmalıdır!');
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      stellarConfig.sorobanServer = originalSoroban;
    }
  });

  it('submitTransaction: İmzalı işlemi Horizon ağına iletmelidir', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const mockAccount = new StellarSdk.Account(dummyAddress, '100');
    const mockTx = new StellarSdk.TransactionBuilder(mockAccount, {
      fee: '100',
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: dummyAddress,
        asset: StellarSdk.Asset.native(),
        amount: '10',
      }))
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    const mockResponse = { hash: 'a7c45bcec851075acb91396b72c06b66638f396f82affb5c4a49aa227214742b', ledger: 4068741 };

    stellarConfig.horizonServer = {
      submitTransaction: async (tx) => {
        return mockResponse;
      },
    };

    try {
      const res = await submitTransaction(mockTx);
      assert.equal(res.hash, mockResponse.hash);
      assert.equal(res.ledger, 4068741);
    } finally {
      stellarConfig.horizonServer = originalHorizon;
    }
  });

  it('readContractBalance: Bakiyeyi Horizon\'a hiç gitmeden simülasyonla okumalıdır', async () => {
    const originalSoroban = stellarConfig.sorobanServer;
    let capturedTx = null;

    stellarConfig.sorobanServer = {
      simulateTransaction: async (tx) => {
        capturedTx = tx;
        return { transactionData: {}, result: { retval: StellarSdk.nativeToScVal('95600000', { type: 'i128' }) } };
      },
    };

    try {
      const balance = await readContractBalance(dummyContractId, dummyAddress);
      assert.equal(balance, '95600000');
      assert.ok(capturedTx instanceof StellarSdk.Transaction);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
    }
  });

  it('readContractBalance: Simülasyon hatasında fırlatmalıdır', async () => {
    const originalSoroban = stellarConfig.sorobanServer;

    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({ error: 'HostError' }),
    };

    try {
      await assert.rejects(() => readContractBalance(dummyContractId, dummyAddress), /simülasyonu başarısız/);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
    }
  });

  it('readContractBalance: Soroban RPC yapılandırılmamışsa fırlatmalıdır', async () => {
    const originalSoroban = stellarConfig.sorobanServer;
    stellarConfig.sorobanServer = null;

    try {
      await assert.rejects(() => readContractBalance(dummyContractId, dummyAddress), /yapılandırılmamış/);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
    }
  });
});
