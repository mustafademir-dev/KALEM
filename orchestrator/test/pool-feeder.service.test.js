import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import cron from 'node-cron';
import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import PoolFeed from '../src/models/PoolFeed.model.js';
import {
  checkPool2Balance,
  readPool4DtlBalance,
  resolveBurnAmount,
  burnPool4Dtl,
  convertDtlToXlm,
  injectXlmToPool2,
  runPoolFeedCycle,
  startPoolFeederCron,
} from '../src/services/pool-feeder.service.js';

describe('PoolFeeder Service Unit Tests', () => {
  const dummyContractId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';

  it('checkPool2Balance: Horizon bakiyelerinden native XLM tutarını okumalıdır', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalUseSpendable = config.poolFeeder.useSpendableBalance;
    const originalPool2 = config.pools.pool2Address;
    config.poolFeeder.useSpendableBalance = false;
    config.pools.pool2Address = 'GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK';

    stellarConfig.horizonServer = {
      loadAccount: async () => ({
        subentry_count: 0,
        balances: [
          { asset_type: 'credit_alphanum4', balance: '5.0000000' },
          { asset_type: 'native', balance: '42.5000000', selling_liabilities: '0' },
        ],
      }),
    };

    try {
      const balance = await checkPool2Balance();
      assert.equal(balance, 42.5);
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      config.poolFeeder.useSpendableBalance = originalUseSpendable;
      config.pools.pool2Address = originalPool2;
    }
  });

  it('checkPool2Balance: Native bakiye yoksa 0 dönmelidir', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalPool2 = config.pools.pool2Address;
    config.pools.pool2Address = 'GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK';
    stellarConfig.horizonServer = {
      loadAccount: async () => ({ subentry_count: 0, balances: [] }),
    };
    try {
      assert.equal(await checkPool2Balance(), 0);
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      config.pools.pool2Address = originalPool2;
    }
  });

  it('checkPool2Balance: Harcanabilir mod açıkken minimum rezervi düşmelidir', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalUseSpendable = config.poolFeeder.useSpendableBalance;
    const originalPool2 = config.pools.pool2Address;
    config.poolFeeder.useSpendableBalance = true;
    config.pools.pool2Address = 'GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK';

    stellarConfig.horizonServer = {
      loadAccount: async () => ({
        subentry_count: 0,
        balances: [{ asset_type: 'native', balance: '42.5000000', selling_liabilities: '0' }],
      }),
    };

    try {
      // rezerv = (2 + 0) * 0.5 = 1 -> 42.5 - 1 = 41.5
      assert.equal(await checkPool2Balance(), 41.5);
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      config.poolFeeder.useSpendableBalance = originalUseSpendable;
      config.pools.pool2Address = originalPool2;
    }
  });

  it('readPool4DtlBalance: Bakiyeyi Horizon\'a HİÇ gitmeden simülasyonla okumalıdır', async () => {
    const originalSoroban = stellarConfig.sorobanServer;
    const originalHorizon = stellarConfig.horizonServer;
    const originalIssuerSecret = config.secrets.issuerSecretKey;
    const originalPool4 = config.pools.pool4Address;
    const originalDtlId = config.contracts.dtlTokenId;

    const issuerKp = StellarSdk.Keypair.random();
    config.secrets.issuerSecretKey = issuerKp.secret();
    config.pools.pool4Address = StellarSdk.Keypair.random().publicKey();
    config.contracts.dtlTokenId = dummyContractId;

    let loadCalled = false;
    let capturedTx = null;
    stellarConfig.horizonServer = {
      loadAccount: async () => {
        loadCalled = true;
        return new StellarSdk.Account(issuerKp.publicKey(), '100');
      },
    };
    stellarConfig.sorobanServer = {
      simulateTransaction: async (tx) => {
        capturedTx = tx;
        return { transactionData: {}, result: { retval: StellarSdk.nativeToScVal('123450000', { type: 'i128' }) } };
      },
    };

    try {
      const balance = await readPool4DtlBalance();
      assert.equal(balance, '123450000');
      assert.equal(loadCalled, false, 'Horizon çağrısı yapılmamalıdır');
      assert.ok(capturedTx instanceof StellarSdk.Transaction);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
      stellarConfig.horizonServer = originalHorizon;
      config.secrets.issuerSecretKey = originalIssuerSecret;
      config.pools.pool4Address = originalPool4;
      config.contracts.dtlTokenId = originalDtlId;
    }
  });

  it('readPool4DtlBalance: Simülasyon hatasında fırlatmalıdır', async () => {
    const originalSoroban = stellarConfig.sorobanServer;
    const originalIssuerSecret = config.secrets.issuerSecretKey;
    const originalPool4 = config.pools.pool4Address;
    const originalDtlId = config.contracts.dtlTokenId;

    config.secrets.issuerSecretKey = StellarSdk.Keypair.random().secret();
    config.pools.pool4Address = StellarSdk.Keypair.random().publicKey();
    config.contracts.dtlTokenId = dummyContractId;

    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({ error: 'HostError' }),
    };

    try {
      await assert.rejects(() => readPool4DtlBalance(), /simülasyonu başarısız/);
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
      config.secrets.issuerSecretKey = originalIssuerSecret;
      config.pools.pool4Address = originalPool4;
      config.contracts.dtlTokenId = originalDtlId;
    }
  });

  it('resolveBurnAmount: Minimum altındaki bakiye için null dönmelidir', () => {
    const originalMin = config.poolFeeder.minBurnStroops;
    const originalMax = config.poolFeeder.maxBurnStroops;
    config.poolFeeder.minBurnStroops = '1000';
    config.poolFeeder.maxBurnStroops = '999999999999';
    try {
      assert.equal(resolveBurnAmount('500'), null);
    } finally {
      config.poolFeeder.minBurnStroops = originalMin;
      config.poolFeeder.maxBurnStroops = originalMax;
    }
  });

  it('resolveBurnAmount: Maksimumu aşan bakiyeyi tavana kadar kırpmalıdır', () => {
    const originalMin = config.poolFeeder.minBurnStroops;
    const originalMax = config.poolFeeder.maxBurnStroops;
    config.poolFeeder.minBurnStroops = '1000';
    config.poolFeeder.maxBurnStroops = '5000';
    try {
      assert.equal(resolveBurnAmount('999999'), '5000');
    } finally {
      config.poolFeeder.minBurnStroops = originalMin;
      config.poolFeeder.maxBurnStroops = originalMax;
    }
  });

  it('resolveBurnAmount: Aralık içindeki bakiyeyi olduğu gibi döndürmelidir', () => {
    const originalMin = config.poolFeeder.minBurnStroops;
    const originalMax = config.poolFeeder.maxBurnStroops;
    config.poolFeeder.minBurnStroops = '1000';
    config.poolFeeder.maxBurnStroops = '5000';
    try {
      assert.equal(resolveBurnAmount('3000'), '3000');
    } finally {
      config.poolFeeder.minBurnStroops = originalMin;
      config.poolFeeder.maxBurnStroops = originalMax;
    }
  });

  it('burnPool4Dtl: burn çağrısını Havuz 4 adresi ve i128 tutarla kurmalı, ihraççı ile imzalamalıdır', async () => {
    const originalSoroban = stellarConfig.sorobanServer;
    const originalHorizon = stellarConfig.horizonServer;
    const originalIssuerSecret = config.secrets.issuerSecretKey;
    const originalPool4 = config.pools.pool4Address;
    const originalDtlId = config.contracts.dtlTokenId;

    const issuerKp = StellarSdk.Keypair.random();
    const pool4Address = StellarSdk.Keypair.random().publicKey();
    config.secrets.issuerSecretKey = issuerKp.secret();
    config.pools.pool4Address = pool4Address;
    config.contracts.dtlTokenId = dummyContractId;

    let prepareCalled = false;
    let capturedOp = null;
    let capturedSubmitted = null;

    stellarConfig.horizonServer = {
      loadAccount: async () => new StellarSdk.Account(issuerKp.publicKey(), '100'),
      submitTransaction: async (tx) => {
        capturedSubmitted = tx;
        return { hash: 'burnhash123' };
      },
    };
    stellarConfig.sorobanServer = {
      prepareTransaction: async (rawTx) => {
        prepareCalled = true;
        capturedOp = rawTx.operations[0];
        return rawTx;
      },
    };

    try {
      const hash = await burnPool4Dtl('123450000');
      assert.equal(hash, 'burnhash123');
      assert.equal(prepareCalled, true);
      assert.equal(capturedOp.type, 'invokeHostFunction');

      const invoke = capturedOp.func.invokeContract();
      const args = invoke.args();
      const addrArg = StellarSdk.Address.fromScVal(args[0]).toString();
      const amountArg = StellarSdk.scValToNative(args[1]);
      assert.equal(addrArg, pool4Address);
      assert.equal(amountArg.toString(), '123450000');

      assert.equal(capturedSubmitted.signatures.length, 1);
      const sig = capturedSubmitted.signatures[0];
      assert.ok(issuerKp.verify(capturedSubmitted.hash(), sig.signature()));
    } finally {
      stellarConfig.sorobanServer = originalSoroban;
      stellarConfig.horizonServer = originalHorizon;
      config.secrets.issuerSecretKey = originalIssuerSecret;
      config.pools.pool4Address = originalPool4;
      config.contracts.dtlTokenId = originalDtlId;
    }
  });

  it('burnPool4Dtl: Sıfır veya negatif tutarı reddetmelidir', async () => {
    await assert.rejects(() => burnPool4Dtl('0'), /Geçersiz burn tutarı/);
    await assert.rejects(() => burnPool4Dtl('-5'), /Geçersiz burn tutarı/);
  });

  it('convertDtlToXlm: DEMO_MODE kapalıyken (varsayılan) her zaman null dönmelidir', () => {
    const originalDemo = config.demoMode;
    const originalRate = config.poolFeeder.demoDtlPerXlm;
    config.demoMode = false;
    config.poolFeeder.demoDtlPerXlm = '1000';
    try {
      assert.equal(convertDtlToXlm('10000000000'), null);
    } finally {
      config.demoMode = originalDemo;
      config.poolFeeder.demoDtlPerXlm = originalRate;
    }
  });

  it('convertDtlToXlm: DEMO_MODE açıkken sabit kurla XLM tutarını hesaplamalıdır', () => {
    const originalDemo = config.demoMode;
    const originalRate = config.poolFeeder.demoDtlPerXlm;
    config.demoMode = true;
    config.poolFeeder.demoDtlPerXlm = '1000'; // 1000 dTL = 1 XLM
    try {
      // 3_000_000_0000 stroops = 300 dTL -> 300/1000 = 0.3 XLM
      assert.equal(convertDtlToXlm('3000000000'), '0.3000000');
    } finally {
      config.demoMode = originalDemo;
      config.poolFeeder.demoDtlPerXlm = originalRate;
    }
  });

  it('injectXlmToPool2: Manuel modda (null tutar) hiçbir ağ çağrısı yapmadan null dönmelidir', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    let submitCalled = false;
    stellarConfig.horizonServer = {
      submitTransaction: async () => {
        submitCalled = true;
        return { hash: 'should-not-happen' };
      },
    };
    try {
      const result = await injectXlmToPool2(null);
      assert.equal(result, null);
      assert.equal(submitCalled, false, 'Manuel modda ağa hiç gönderim yapılmamalıdır');
    } finally {
      stellarConfig.horizonServer = originalHorizon;
    }
  });

  it('injectXlmToPool2: DEMO_MODE tutarıyla native payment operasyonu üretmelidir', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalIssuerSecret = config.secrets.issuerSecretKey;
    const originalPool2 = config.pools.pool2Address;

    const issuerKp = StellarSdk.Keypair.random();
    const pool2Address = StellarSdk.Keypair.random().publicKey();
    config.secrets.issuerSecretKey = issuerKp.secret();
    config.pools.pool2Address = pool2Address;

    let capturedOp = null;
    stellarConfig.horizonServer = {
      loadAccount: async () => new StellarSdk.Account(issuerKp.publicKey(), '100'),
      submitTransaction: async (tx) => {
        capturedOp = tx.operations[0];
        return { hash: 'injecthash123' };
      },
    };

    try {
      const hash = await injectXlmToPool2('25');
      assert.equal(hash, 'injecthash123');
      assert.equal(capturedOp.type, 'payment');
      assert.equal(capturedOp.destination, pool2Address);
      assert.equal(capturedOp.asset.isNative(), true);
      assert.equal(capturedOp.amount, '25.0000000');
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      config.secrets.issuerSecretKey = originalIssuerSecret;
      config.pools.pool2Address = originalPool2;
    }
  });

  it('runPoolFeedCycle: Bakiye eşik üstündeyken hiçbir şey tetiklememelidir', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalPool2 = config.pools.pool2Address;
    const originalThreshold = config.pool2XlmThreshold;
    const originalCreate = PoolFeed.create;

    config.pools.pool2Address = StellarSdk.Keypair.random().publicKey();
    config.pool2XlmThreshold = 10;
    let createCalled = false;
    PoolFeed.create = async (doc) => {
      createCalled = true;
      return doc;
    };
    stellarConfig.horizonServer = {
      loadAccount: async () => ({
        subentry_count: 0,
        balances: [{ asset_type: 'native', balance: '100.0000000', selling_liabilities: '0' }],
      }),
    };

    try {
      const result = await runPoolFeedCycle();
      assert.equal(result, null);
      assert.equal(createCalled, false, 'Eşik üstündeyken PoolFeed kaydı açılmamalıdır');
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      config.pools.pool2Address = originalPool2;
      config.pool2XlmThreshold = originalThreshold;
      PoolFeed.create = originalCreate;
    }
  });

  it('runPoolFeedCycle: Eşik altındayken PoolFeed kaydı açıp burn tetiklemeli, manuel modda awaiting_offchain ile durmalıdır', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalSoroban = stellarConfig.sorobanServer;
    const originalCreate = PoolFeed.create;
    const originalPool2 = config.pools.pool2Address;
    const originalPool4 = config.pools.pool4Address;
    const originalThreshold = config.pool2XlmThreshold;
    const originalIssuerSecret = config.secrets.issuerSecretKey;
    const originalDtlId = config.contracts.dtlTokenId;
    const originalUseSpendable = config.poolFeeder.useSpendableBalance;
    const originalMin = config.poolFeeder.minBurnStroops;
    const originalMax = config.poolFeeder.maxBurnStroops;
    const originalDemo = config.demoMode;

    const issuerKp = StellarSdk.Keypair.random();
    config.pools.pool2Address = StellarSdk.Keypair.random().publicKey();
    config.pools.pool4Address = StellarSdk.Keypair.random().publicKey();
    config.pool2XlmThreshold = 10;
    config.secrets.issuerSecretKey = issuerKp.secret();
    config.contracts.dtlTokenId = dummyContractId;
    config.poolFeeder.useSpendableBalance = false;
    config.poolFeeder.minBurnStroops = '1';
    config.poolFeeder.maxBurnStroops = '999999999999';
    config.demoMode = false;

    const savedStatuses = [];
    PoolFeed.create = async (doc) => ({
      ...doc,
      save: async function () {
        savedStatuses.push(this.status);
        return this;
      },
    });

    stellarConfig.horizonServer = {
      loadAccount: async (addr) => {
        if (addr === config.pools.pool2Address) {
          return {
            subentry_count: 0,
            balances: [{ asset_type: 'native', balance: '5.0000000', selling_liabilities: '0' }],
          };
        }
        return new StellarSdk.Account(issuerKp.publicKey(), '100');
      },
      submitTransaction: async () => ({ hash: 'burnhash-cycle' }),
    };
    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({
        transactionData: {},
        result: { retval: StellarSdk.nativeToScVal('3000000', { type: 'i128' }) },
      }),
      prepareTransaction: async (rawTx) => rawTx,
    };

    try {
      const feed = await runPoolFeedCycle();
      assert.ok(feed, 'PoolFeed kaydı dönmelidir');
      assert.equal(feed.burnTxHash, 'burnhash-cycle');
      assert.deepEqual(savedStatuses, ['burn_submitted', 'awaiting_offchain']);
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      stellarConfig.sorobanServer = originalSoroban;
      PoolFeed.create = originalCreate;
      config.pools.pool2Address = originalPool2;
      config.pools.pool4Address = originalPool4;
      config.pool2XlmThreshold = originalThreshold;
      config.secrets.issuerSecretKey = originalIssuerSecret;
      config.contracts.dtlTokenId = originalDtlId;
      config.poolFeeder.useSpendableBalance = originalUseSpendable;
      config.poolFeeder.minBurnStroops = originalMin;
      config.poolFeeder.maxBurnStroops = originalMax;
      config.demoMode = originalDemo;
    }
  });

  it('runPoolFeedCycle: Açık bir döngü varken (E11000) burn YAPMAMALIDIR', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalSoroban = stellarConfig.sorobanServer;
    const originalCreate = PoolFeed.create;
    const originalPool2 = config.pools.pool2Address;
    const originalPool4 = config.pools.pool4Address;
    const originalThreshold = config.pool2XlmThreshold;
    const originalIssuerSecret = config.secrets.issuerSecretKey;
    const originalDtlId = config.contracts.dtlTokenId;
    const originalMin = config.poolFeeder.minBurnStroops;
    const originalMax = config.poolFeeder.maxBurnStroops;

    config.pools.pool2Address = StellarSdk.Keypair.random().publicKey();
    config.pools.pool4Address = StellarSdk.Keypair.random().publicKey();
    config.pool2XlmThreshold = 10;
    config.secrets.issuerSecretKey = StellarSdk.Keypair.random().secret();
    config.contracts.dtlTokenId = dummyContractId;
    config.poolFeeder.minBurnStroops = '1';
    config.poolFeeder.maxBurnStroops = '999999999999';

    let prepareCalled = false;
    PoolFeed.create = async () => {
      const err = new Error('E11000 duplicate key');
      err.code = 11000;
      throw err;
    };
    stellarConfig.horizonServer = {
      loadAccount: async () => ({
        subentry_count: 0,
        balances: [{ asset_type: 'native', balance: '5.0000000', selling_liabilities: '0' }],
      }),
    };
    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({
        transactionData: {},
        result: { retval: StellarSdk.nativeToScVal('3000000', { type: 'i128' }) },
      }),
      prepareTransaction: async (rawTx) => {
        prepareCalled = true;
        return rawTx;
      },
    };

    try {
      const result = await runPoolFeedCycle();
      assert.equal(result, null);
      assert.equal(prepareCalled, false, 'Açık döngü varken burn işlemi hiç hazırlanmamalıdır');
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      stellarConfig.sorobanServer = originalSoroban;
      PoolFeed.create = originalCreate;
      config.pools.pool2Address = originalPool2;
      config.pools.pool4Address = originalPool4;
      config.pool2XlmThreshold = originalThreshold;
      config.secrets.issuerSecretKey = originalIssuerSecret;
      config.contracts.dtlTokenId = originalDtlId;
      config.poolFeeder.minBurnStroops = originalMin;
      config.poolFeeder.maxBurnStroops = originalMax;
    }
  });

  it('runPoolFeedCycle: Burn başarısız olursa kaydı failed yapmalıdır', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalSoroban = stellarConfig.sorobanServer;
    const originalCreate = PoolFeed.create;
    const originalPool2 = config.pools.pool2Address;
    const originalPool4 = config.pools.pool4Address;
    const originalThreshold = config.pool2XlmThreshold;
    const originalIssuerSecret = config.secrets.issuerSecretKey;
    const originalDtlId = config.contracts.dtlTokenId;
    const originalMin = config.poolFeeder.minBurnStroops;
    const originalMax = config.poolFeeder.maxBurnStroops;

    config.pools.pool2Address = StellarSdk.Keypair.random().publicKey();
    config.pools.pool4Address = StellarSdk.Keypair.random().publicKey();
    config.pool2XlmThreshold = 10;
    config.secrets.issuerSecretKey = StellarSdk.Keypair.random().secret();
    config.contracts.dtlTokenId = dummyContractId;
    config.poolFeeder.minBurnStroops = '1';
    config.poolFeeder.maxBurnStroops = '999999999999';

    const issuerKp = StellarSdk.Keypair.fromSecret(config.secrets.issuerSecretKey);

    const savedStatuses = [];
    let savedErrorMessage = null;
    PoolFeed.create = async (doc) => ({
      ...doc,
      save: async function () {
        savedStatuses.push(this.status);
        savedErrorMessage = this.errorMessage;
        return this;
      },
    });
    stellarConfig.horizonServer = {
      loadAccount: async (addr) => {
        if (addr === config.pools.pool2Address) {
          return {
            subentry_count: 0,
            balances: [{ asset_type: 'native', balance: '5.0000000', selling_liabilities: '0' }],
          };
        }
        return new StellarSdk.Account(issuerKp.publicKey(), '100');
      },
    };
    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({
        transactionData: {},
        result: { retval: StellarSdk.nativeToScVal('3000000', { type: 'i128' }) },
      }),
      prepareTransaction: async () => {
        throw new Error('Soroban RPC kullanılamıyor');
      },
    };

    try {
      await assert.rejects(() => runPoolFeedCycle(), /Soroban RPC kullanılamıyor/);
      assert.deepEqual(savedStatuses, ['failed']);
      assert.match(savedErrorMessage, /Soroban RPC kullanılamıyor/);
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      stellarConfig.sorobanServer = originalSoroban;
      PoolFeed.create = originalCreate;
      config.pools.pool2Address = originalPool2;
      config.pools.pool4Address = originalPool4;
      config.pool2XlmThreshold = originalThreshold;
      config.secrets.issuerSecretKey = originalIssuerSecret;
      config.contracts.dtlTokenId = originalDtlId;
      config.poolFeeder.minBurnStroops = originalMin;
      config.poolFeeder.maxBurnStroops = originalMax;
    }
  });

  it('startPoolFeederCron: Cron görevini yapılandırılmış ifadeyle planlamalıdır', () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalPool2 = config.pools.pool2Address;
    const originalPool4 = config.pools.pool4Address;
    const originalIssuerSecret = config.secrets.issuerSecretKey;
    const originalSchedule = cron.schedule;

    stellarConfig.horizonServer = { loadAccount: async () => ({}) };
    config.pools.pool2Address = StellarSdk.Keypair.random().publicKey();
    config.pools.pool4Address = StellarSdk.Keypair.random().publicKey();
    config.secrets.issuerSecretKey = StellarSdk.Keypair.random().secret();

    let scheduled = false;
    let capturedExpr = null;
    let capturedFn = null;
    cron.schedule = (expr, fn) => {
      scheduled = true;
      capturedExpr = expr;
      capturedFn = fn;
      return { stop() {} };
    };

    try {
      const task = startPoolFeederCron();
      assert.equal(scheduled, true);
      assert.equal(capturedExpr, config.poolFeeder.cronExpression);
      assert.equal(typeof capturedFn, 'function');
      assert.equal(typeof task.stop, 'function');
    } finally {
      cron.schedule = originalSchedule;
      stellarConfig.horizonServer = originalHorizon;
      config.pools.pool2Address = originalPool2;
      config.pools.pool4Address = originalPool4;
      config.secrets.issuerSecretKey = originalIssuerSecret;
    }
  });

  it('startPoolFeederCron: Horizon yapılandırılmamışsa null dönmeli ve planlama yapmamalıdır', () => {
    const originalHorizon = stellarConfig.horizonServer;
    const originalSchedule = cron.schedule;
    stellarConfig.horizonServer = null;

    let scheduled = false;
    cron.schedule = () => {
      scheduled = true;
      return { stop() {} };
    };

    try {
      const task = startPoolFeederCron();
      assert.equal(task, null);
      assert.equal(scheduled, false);
    } finally {
      cron.schedule = originalSchedule;
      stellarConfig.horizonServer = originalHorizon;
    }
  });
});
