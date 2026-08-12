import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import {
  readInnerResourceFee,
  calculateFeeBumpBaseFee,
  assertValidInnerTransaction,
  simulateInnerTransaction,
  extractHorizonResultCodes,
  wrapAndSubmitFeeBump,
} from '../src/services/fee-bump.service.js';

describe('FeeBump Service Unit Tests', () => {
  const dummyContractId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';
  const otherContractId = 'CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF';

  /** İmzalı, tek operasyonlu (invokeHostFunction) bir iç zarf üretir. */
  const buildSignedInnerXdr = (keypair, contractId = dummyContractId, { sign = true, fee = '100' } = {}) => {
    const account = new StellarSdk.Account(keypair.publicKey(), '100');
    const contract = new StellarSdk.Contract(contractId);
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(contract.call('balance', StellarSdk.Address.fromString(keypair.publicKey()).toScVal()))
      .setTimeout(300)
      .build();
    if (sign) tx.sign(keypair);
    return tx;
  };

  it('calculateFeeBumpBaseFee: Soroban olmayan tek operasyonlu iç zarfta ağ tabanını marjla çarpmalıdır', () => {
    const kp = StellarSdk.Keypair.random();
    const tx = buildSignedInnerXdr(kp);
    const originalMultiplier = config.feeBump.baseFeeMultiplier;
    config.feeBump.baseFeeMultiplier = 2;
    try {
      const baseFee = calculateFeeBumpBaseFee(tx);
      assert.equal(baseFee, '200', 'baseFee = max(100, inclusion) * 2 = 200 olmalıdır');
    } finally {
      config.feeBump.baseFeeMultiplier = originalMultiplier;
    }
  });

  it('calculateFeeBumpBaseFee: resourceFee taşımayan iç zarfta okunan kaynak ücreti 0 olmalıdır', () => {
    const kp = StellarSdk.Keypair.random();
    const tx = buildSignedInnerXdr(kp);
    assert.equal(readInnerResourceFee(tx), 0n);
  });

  it('calculateFeeBumpBaseFee: Üst sınırı aşan baseFee\'yi reddetmelidir', () => {
    const kp = StellarSdk.Keypair.random();
    const tx = buildSignedInnerXdr(kp);
    const originalMax = config.feeBump.maxBaseFeeStroops;
    const originalMultiplier = config.feeBump.baseFeeMultiplier;
    config.feeBump.maxBaseFeeStroops = '150';
    config.feeBump.baseFeeMultiplier = 2;
    try {
      assert.throws(() => calculateFeeBumpBaseFee(tx), /üst sınırı aşıyor/);
    } finally {
      config.feeBump.maxBaseFeeStroops = originalMax;
      config.feeBump.baseFeeMultiplier = originalMultiplier;
    }
  });

  it('assertValidInnerTransaction: İmzasız iç zarfı reddetmelidir', () => {
    const kp = StellarSdk.Keypair.random();
    const tx = buildSignedInnerXdr(kp, dummyContractId, { sign: false });
    assert.throws(() => assertValidInnerTransaction(tx), /imzasız/);
  });

  it('assertValidInnerTransaction: Beyaz listede olmayan kontrat çağrısını reddetmelidir', () => {
    const kp = StellarSdk.Keypair.random();
    const tx = buildSignedInnerXdr(kp, dummyContractId);
    const original = config.feeBump.allowedContractIds;
    config.feeBump.allowedContractIds = [otherContractId];
    try {
      assert.throws(() => assertValidInnerTransaction(tx), /Yetkisiz kontrat/);
    } finally {
      config.feeBump.allowedContractIds = original;
    }
  });

  it('assertValidInnerTransaction: Klasik payment operasyonunu reddetmelidir', () => {
    const kp = StellarSdk.Keypair.random();
    const account = new StellarSdk.Account(kp.publicKey(), '100');
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: kp.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: '10',
        })
      )
      .setTimeout(300)
      .build();
    tx.sign(kp);

    const original = config.feeBump.allowedContractIds;
    config.feeBump.allowedContractIds = [dummyContractId];
    try {
      assert.throws(() => assertValidInnerTransaction(tx), /Desteklenmeyen operasyon tipi/);
    } finally {
      config.feeBump.allowedContractIds = original;
    }
  });

  it('assertValidInnerTransaction: Havuz adresi kaynaklı iç zarfı reddetmelidir', () => {
    const poolKp = StellarSdk.Keypair.random();
    const tx = buildSignedInnerXdr(poolKp, dummyContractId);

    const originalPool1 = config.pools.pool1Address;
    const originalAllowed = config.feeBump.allowedContractIds;
    config.pools.pool1Address = poolKp.publicKey();
    config.feeBump.allowedContractIds = [dummyContractId];
    try {
      assert.throws(() => assertValidInnerTransaction(tx), /korumalı bir havuz adresi/);
    } finally {
      config.pools.pool1Address = originalPool1;
      config.feeBump.allowedContractIds = originalAllowed;
    }
  });

  it('assertValidInnerTransaction: İç içe Fee-Bump zarfını reddetmelidir', () => {
    const kp = StellarSdk.Keypair.random();
    const innerTx = buildSignedInnerXdr(kp);
    const feeSourceKp = StellarSdk.Keypair.random();
    const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      feeSourceKp.publicKey(),
      '1000',
      innerTx,
      stellarConfig.networkPassphrase
    );
    feeBumpTx.sign(feeSourceKp);
    assert.throws(() => assertValidInnerTransaction(feeBumpTx), /iç içe sarmalama reddedildi/);
  });

  it('extractHorizonResultCodes: Horizon extras yapısından result_codes çıkarmalıdır', () => {
    const fakeError = {
      response: { data: { extras: { result_codes: { transaction: 'tx_insufficient_fee', operations: [] } } } },
    };
    const codes = extractHorizonResultCodes(fakeError);
    assert.equal(codes.transaction, 'tx_insufficient_fee');
    assert.deepEqual(codes.operations, []);
  });

  it('extractHorizonResultCodes: extras yoksa null dönmelidir', () => {
    assert.equal(extractHorizonResultCodes(new Error('boş hata')), null);
  });

  it('simulateInnerTransaction: Başarılı simülasyonda sonucu döndürmelidir', async () => {
    const kp = StellarSdk.Keypair.random();
    const tx = buildSignedInnerXdr(kp);
    const originalSoroban = stellarConfig.sorobanServer;
    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({ transactionData: {} }),
    };
    try {
      const sim = await simulateInnerTransaction(tx);
      assert.ok(sim);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
    }
  });

  it('simulateInnerTransaction: Başarısız simülasyonda fırlatmalı ve Havuz 2 ücreti hiç harcanmamalıdır', async () => {
    const kp = StellarSdk.Keypair.random();
    const tx = buildSignedInnerXdr(kp);
    const originalSoroban = stellarConfig.sorobanServer;
    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({ error: 'HostError: contract çağrısı başarısız' }),
    };
    try {
      await assert.rejects(() => simulateInnerTransaction(tx), /simülasyonu başarısız/);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
    }
  });

  it('wrapAndSubmitFeeBump: İç zarfı Havuz 2 imzasıyla saran dış zarfı ağa iletmeli ve iç imzayı DEĞİŞTİRMEMELİDİR', async () => {
    const senderKp = StellarSdk.Keypair.random();
    const pool2Kp = StellarSdk.Keypair.random();
    const innerTx = buildSignedInnerXdr(senderKp);
    const originalInnerSig = innerTx.signatures[0].signature().toString('base64');
    const signedInnerXdr = innerTx.toXDR();

    const originalSoroban = stellarConfig.sorobanServer;
    const originalHorizon = stellarConfig.horizonServer;
    const originalSecret = config.secrets.pool2SecretKey;
    const originalPool2Addr = config.pools.pool2Address;
    const originalAllowed = config.feeBump.allowedContractIds;

    let captured = null;
    stellarConfig.sorobanServer = { simulateTransaction: async () => ({ transactionData: {} }) };
    stellarConfig.horizonServer = {
      submitTransaction: async (tx) => {
        captured = tx;
        return { hash: 'feebumphash123', ledger: 42 };
      },
    };
    config.secrets.pool2SecretKey = pool2Kp.secret();
    config.pools.pool2Address = pool2Kp.publicKey();
    config.feeBump.allowedContractIds = [dummyContractId];

    try {
      const response = await wrapAndSubmitFeeBump(signedInnerXdr);
      assert.equal(response.hash, 'feebumphash123');

      assert.ok(captured instanceof StellarSdk.FeeBumpTransaction, 'Ağa gönderilen nesne bir FeeBumpTransaction olmalıdır');
      assert.equal(captured.feeSource, pool2Kp.publicKey());
      assert.equal(captured.signatures.length, 1, 'Dış zarf yalnızca 1 imza taşımalıdır (Havuz 2)');

      const innerSigAfter = captured.innerTransaction.signatures[0].signature().toString('base64');
      assert.equal(innerSigAfter, originalInnerSig, 'İç zarfın Ed25519 imzası DEĞİŞMEMİŞ olmalıdır');

      assert.ok(BigInt(captured.fee) > BigInt(innerTx.fee), 'Dış zarf ücreti iç zarf ücretinden büyük olmalıdır');
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
      stellarConfig.horizonServer = originalHorizon;
      config.secrets.pool2SecretKey = originalSecret;
      config.pools.pool2Address = originalPool2Addr;
      config.feeBump.allowedContractIds = originalAllowed;
    }
  });

  it('wrapAndSubmitFeeBump: Toplam ücret tavanı aşılırsa ağa HİÇ gönderim yapmamalıdır', async () => {
    const senderKp = StellarSdk.Keypair.random();
    const pool2Kp = StellarSdk.Keypair.random();
    const innerTx = buildSignedInnerXdr(senderKp);
    const signedInnerXdr = innerTx.toXDR();

    const originalSoroban = stellarConfig.sorobanServer;
    const originalHorizon = stellarConfig.horizonServer;
    const originalSecret = config.secrets.pool2SecretKey;
    const originalPool2Addr = config.pools.pool2Address;
    const originalAllowed = config.feeBump.allowedContractIds;
    const originalMaxTotal = config.feeBump.maxTotalFeeStroops;

    let submitCalled = false;
    stellarConfig.sorobanServer = { simulateTransaction: async () => ({ transactionData: {} }) };
    stellarConfig.horizonServer = {
      submitTransaction: async () => {
        submitCalled = true;
        return { hash: 'should-not-happen' };
      },
    };
    config.secrets.pool2SecretKey = pool2Kp.secret();
    config.pools.pool2Address = pool2Kp.publicKey();
    config.feeBump.allowedContractIds = [dummyContractId];
    config.feeBump.maxTotalFeeStroops = '1'; // gerçekçi hiçbir dış ücret bunun altında olamaz

    try {
      await assert.rejects(() => wrapAndSubmitFeeBump(signedInnerXdr), /toplam ücreti üst sınırı aşıyor/);
      assert.equal(submitCalled, false, 'Ücret tavanı aşıldığında ağa gönderim yapılmamalıdır');
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
      stellarConfig.horizonServer = originalHorizon;
      config.secrets.pool2SecretKey = originalSecret;
      config.pools.pool2Address = originalPool2Addr;
      config.feeBump.allowedContractIds = originalAllowed;
      config.feeBump.maxTotalFeeStroops = originalMaxTotal;
    }
  });

  it('wrapAndSubmitFeeBump: Simülasyon başarısızsa ağa gönderim yapmamalıdır', async () => {
    const senderKp = StellarSdk.Keypair.random();
    const pool2Kp = StellarSdk.Keypair.random();
    const innerTx = buildSignedInnerXdr(senderKp);
    const signedInnerXdr = innerTx.toXDR();

    const originalSoroban = stellarConfig.sorobanServer;
    const originalHorizon = stellarConfig.horizonServer;
    const originalSecret = config.secrets.pool2SecretKey;
    const originalAllowed = config.feeBump.allowedContractIds;

    let submitCalled = false;
    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({ error: 'HostError' }),
    };
    stellarConfig.horizonServer = {
      submitTransaction: async () => {
        submitCalled = true;
        return { hash: 'should-not-happen' };
      },
    };
    config.secrets.pool2SecretKey = pool2Kp.secret();
    config.feeBump.allowedContractIds = [dummyContractId];

    try {
      await assert.rejects(() => wrapAndSubmitFeeBump(signedInnerXdr), /simülasyonu başarısız/);
      assert.equal(submitCalled, false);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
      stellarConfig.horizonServer = originalHorizon;
      config.secrets.pool2SecretKey = originalSecret;
      config.feeBump.allowedContractIds = originalAllowed;
    }
  });

  it('wrapAndSubmitFeeBump: Horizon hatasını yutmadan yeniden fırlatmalıdır', async () => {
    const senderKp = StellarSdk.Keypair.random();
    const pool2Kp = StellarSdk.Keypair.random();
    const innerTx = buildSignedInnerXdr(senderKp);
    const signedInnerXdr = innerTx.toXDR();

    const originalSoroban = stellarConfig.sorobanServer;
    const originalHorizon = stellarConfig.horizonServer;
    const originalSecret = config.secrets.pool2SecretKey;
    const originalAllowed = config.feeBump.allowedContractIds;

    stellarConfig.sorobanServer = { simulateTransaction: async () => ({ transactionData: {} }) };
    stellarConfig.horizonServer = {
      submitTransaction: async () => {
        const err = new Error('Request failed with status code 400');
        err.response = { data: { extras: { result_codes: { transaction: 'tx_insufficient_fee' } } } };
        throw err;
      },
    };
    config.secrets.pool2SecretKey = pool2Kp.secret();
    config.feeBump.allowedContractIds = [dummyContractId];

    try {
      await assert.rejects(() => wrapAndSubmitFeeBump(signedInnerXdr), /tx_insufficient_fee|status code 400/);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
      stellarConfig.horizonServer = originalHorizon;
      config.secrets.pool2SecretKey = originalSecret;
      config.feeBump.allowedContractIds = originalAllowed;
    }
  });
});
