import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import stellarConfig from '../src/config/stellar.js';
import config from '../src/config/index.js';
import Transaction from '../src/models/Transaction.model.js';
import GibDocument from '../src/models/GibDocument.model.js';
import { handleTransaction, startSSEListener } from '../src/services/sse-listener.service.js';

describe('SSE Listener Service Unit Tests', () => {
  const dummyTxHash = 'a3ca5ad1814a16e24980b6afa92791d01b086a978856c0870565a3964607136c';
  const dummyIdempotencyKey = '123e4567-e89b-12d3-a456-426614174000';

  it('handleTransaction: Gelen SSE kaydını MongoDB ile eşleştirip status=confirmed olarak güncellemelidir', async () => {
    let saved = false;

    const mockTransaction = {
      _id: '507f1f77bcf86cd799439011',
      txHash: dummyTxHash,
      idempotencyKey: dummyIdempotencyKey,
      status: 'pending',
      merchantId: 'merchant123',
      totalAmount: '1000000000',
      save: async function () {
        saved = true;
        return this;
      },
    };

    const originalFindOne = Transaction.findOne;
    const originalGibCreate = GibDocument.create;

    Transaction.findOne = async (query) => {
      return mockTransaction;
    };

    GibDocument.create = async (docData) => {
      return {
        _id: '607f1f77bcf86cd799439022',
        ...docData,
      };
    };

    try {
      const record = {
        hash: dummyTxHash,
        ledger: 4068812,
        memo: dummyIdempotencyKey,
      };

      const updatedTx = await handleTransaction(record);

      assert.ok(updatedTx, 'İşlem güncellenmiş olmalıdır');
      assert.equal(updatedTx.status, 'confirmed');
      assert.equal(updatedTx.ledgerNumber, 4068812);
      assert.equal(saved, true, 'save() fonksiyonu tetiklenmiş olmalıdır');
    } finally {
      Transaction.findOne = originalFindOne;
      GibDocument.create = originalGibCreate;
    }
  });

  it('startSSEListener: Horizon SSE akışını başlatmalıdır', async () => {
    const originalHorizon = stellarConfig.horizonServer;
    let streamStarted = false;

    stellarConfig.horizonServer = {
      transactions: () => ({
        forAccount: () => ({
          cursor: () => ({
            stream: (callbacks) => {
              streamStarted = true;
              assert.ok(typeof callbacks.onmessage === 'function');
              return () => { streamStarted = false; };
            },
          }),
        }),
        cursor: () => ({
          stream: (callbacks) => {
            streamStarted = true;
            assert.ok(typeof callbacks.onmessage === 'function');
            return () => { streamStarted = false; };
          },
        }),
      }),
    };

    try {
      const closeFn = startSSEListener();
      assert.equal(streamStarted, true, 'SSE akışı başlatılmış olmalıdır');
      assert.equal(typeof closeFn, 'function', 'Kapatma fonksiyonu döndürülmelidir');
    } finally {
      stellarConfig.horizonServer = originalHorizon;
    }
  });

  it('startSSEListener: Havuz 1 DEĞİL, Havuz 2 (fee sponsor) adresine filtrelenmelidir', async () => {
    // Regresyon testi: fee-bump'lı işlemlerin fee_account'ı Havuz 2'dir;
    // Havuz 1'e filtrelemek onları KAÇIRIR (bkz. HANDOFF Bölüm 9, gerçek
    // testnet doğrulaması: Madde 3 tx'leri Havuz 1'in listesinde hiç görünmüyordu).
    const originalHorizon = stellarConfig.horizonServer;
    const originalPool1 = config.pools.pool1Address;
    const originalPool2 = config.pools.pool2Address;
    config.pools.pool1Address = 'GPOOL1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    config.pools.pool2Address = 'GPOOL2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    let forAccountArg = null;
    stellarConfig.horizonServer = {
      transactions: () => ({
        forAccount: (addr) => {
          forAccountArg = addr;
          return {
            cursor: () => ({
              stream: (callbacks) => {
                assert.ok(typeof callbacks.onmessage === 'function');
                return () => {};
              },
            }),
          };
        },
      }),
    };

    try {
      startSSEListener();
      assert.equal(forAccountArg, config.pools.pool2Address);
      assert.notEqual(forAccountArg, config.pools.pool1Address);
    } finally {
      stellarConfig.horizonServer = originalHorizon;
      config.pools.pool1Address = originalPool1;
      config.pools.pool2Address = originalPool2;
    }
  });
});
