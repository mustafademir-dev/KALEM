import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import IdempotencyKey from '../src/models/IdempotencyKey.model.js';
import { acquireIdempotencyLock, finalizeIdempotencyKey } from '../src/services/idempotency.service.js';

function e11000() {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  return err;
}

describe('Idempotency Service Unit Tests', () => {
  describe('acquireIdempotencyLock', () => {
    it('yeni key için isNew:true dönmeli ve docs DİZİ olarak writeConcern:majority ile oluşturmalıdır', async () => {
      // Mongoose'un Model.create(doc, options) tekil-obje çağrısında options'ı
      // ikinci bir doküman sanma bug'ına karşı regresyon testi — bkz.
      // idempotency.service.js dosya başı yorumu. docs MUTLAKA dizi olmalı.
      const originalCreate = IdempotencyKey.create;
      let createArgs = null;
      IdempotencyKey.create = async (docs, opts) => {
        createArgs = { docs, opts };
        return docs.map((d) => ({ key: d.key, status: d.status }));
      };

      try {
        const result = await acquireIdempotencyLock('11111111-1111-4111-8111-111111111111');
        assert.deepEqual(result, { isNew: true });
        assert.ok(Array.isArray(createArgs.docs), 'create() dizi ile çağrılmalıdır');
        assert.equal(createArgs.docs.length, 1);
        assert.equal(createArgs.docs[0].status, 'processing');
        assert.deepEqual(createArgs.opts, { writeConcern: { w: 'majority' } });
      } finally {
        IdempotencyKey.create = originalCreate;
      }
    });

    it('processing durumundaki mevcut key için isNew:false dönmelidir', async () => {
      const originalCreate = IdempotencyKey.create;
      const originalFindOne = IdempotencyKey.findOne;
      IdempotencyKey.create = async () => {
        throw e11000();
      };
      IdempotencyKey.findOne = async () => ({ status: 'processing' });

      try {
        const result = await acquireIdempotencyLock('key-1');
        assert.equal(result.isNew, false);
        assert.equal(result.existing.status, 'processing');
      } finally {
        IdempotencyKey.create = originalCreate;
        IdempotencyKey.findOne = originalFindOne;
      }
    });

    it('completed durumundaki mevcut key için saklanan result ile isNew:false dönmelidir', async () => {
      const originalCreate = IdempotencyKey.create;
      const originalFindOne = IdempotencyKey.findOne;
      IdempotencyKey.create = async () => {
        throw e11000();
      };
      IdempotencyKey.findOne = async () => ({ status: 'completed', result: { transactionId: 'abc' } });

      try {
        const result = await acquireIdempotencyLock('key-2');
        assert.equal(result.isNew, false);
        assert.equal(result.existing.result.transactionId, 'abc');
      } finally {
        IdempotencyKey.create = originalCreate;
        IdempotencyKey.findOne = originalFindOne;
      }
    });

    it('failed durumundaki mevcut key yeniden denemeye açılmalıdır (isNew:true)', async () => {
      const originalCreate = IdempotencyKey.create;
      const originalFindOne = IdempotencyKey.findOne;
      const originalFindOneAndUpdate = IdempotencyKey.findOneAndUpdate;
      IdempotencyKey.create = async () => {
        throw e11000();
      };
      IdempotencyKey.findOne = async () => ({ status: 'failed' });
      let updateFilter = null;
      IdempotencyKey.findOneAndUpdate = async (filter) => {
        updateFilter = filter;
        return { status: 'processing' };
      };

      try {
        const result = await acquireIdempotencyLock('key-3');
        assert.deepEqual(result, { isNew: true });
        assert.equal(updateFilter.key, 'key-3');
        assert.equal(updateFilter.status, 'failed');
      } finally {
        IdempotencyKey.create = originalCreate;
        IdempotencyKey.findOne = originalFindOne;
        IdempotencyKey.findOneAndUpdate = originalFindOneAndUpdate;
      }
    });

    it('failed->retry yarışında kaybeden istek güncel durumu okuyup isNew:false dönmelidir', async () => {
      const originalCreate = IdempotencyKey.create;
      const originalFindOne = IdempotencyKey.findOne;
      const originalFindOneAndUpdate = IdempotencyKey.findOneAndUpdate;
      IdempotencyKey.create = async () => {
        throw e11000();
      };
      let findOneCallCount = 0;
      IdempotencyKey.findOne = async () => {
        findOneCallCount += 1;
        return findOneCallCount === 1 ? { status: 'failed' } : { status: 'processing' };
      };
      IdempotencyKey.findOneAndUpdate = async () => null; // Başka bir istek kilidi kazandı

      try {
        const result = await acquireIdempotencyLock('key-4');
        assert.equal(result.isNew, false);
        assert.equal(result.existing.status, 'processing');
        assert.equal(findOneCallCount, 2);
      } finally {
        IdempotencyKey.create = originalCreate;
        IdempotencyKey.findOne = originalFindOne;
        IdempotencyKey.findOneAndUpdate = originalFindOneAndUpdate;
      }
    });

    it('E11000 dışındaki hataları loglayıp yeniden fırlatmalıdır', async () => {
      const originalCreate = IdempotencyKey.create;
      IdempotencyKey.create = async () => {
        throw new Error('DB bağlantı hatası');
      };

      try {
        await assert.rejects(() => acquireIdempotencyLock('key-5'), /DB bağlantı hatası/);
      } finally {
        IdempotencyKey.create = originalCreate;
      }
    });
  });

  describe('finalizeIdempotencyKey', () => {
    it('status ve result alanlarını writeConcern:majority ile güncellemelidir', async () => {
      const originalUpdateOne = IdempotencyKey.updateOne;
      let captured = null;
      IdempotencyKey.updateOne = async (filter, update, opts) => {
        captured = { filter, update, opts };
        return { acknowledged: true };
      };

      try {
        await finalizeIdempotencyKey('key-6', 'completed', {
          transactionId: '507f1f77bcf86cd799439011',
          status: 'submitted',
        });
        assert.deepEqual(captured.filter, { key: 'key-6' });
        assert.equal(captured.update.$set.status, 'completed');
        assert.equal(captured.update.$set.result.status, 'submitted');
        assert.equal(captured.update.$set.transactionId, '507f1f77bcf86cd799439011');
        assert.deepEqual(captured.opts, { writeConcern: { w: 'majority' } });
      } finally {
        IdempotencyKey.updateOne = originalUpdateOne;
      }
    });

    it('result verilmezse yalnızca status güncellenmelidir', async () => {
      const originalUpdateOne = IdempotencyKey.updateOne;
      let captured = null;
      IdempotencyKey.updateOne = async (filter, update) => {
        captured = update;
        return {};
      };

      try {
        await finalizeIdempotencyKey('key-7', 'failed');
        assert.equal(captured.$set.status, 'failed');
        assert.equal('result' in captured.$set, false);
      } finally {
        IdempotencyKey.updateOne = originalUpdateOne;
      }
    });

    it('updateOne hata fırlatırsa loglayıp yeniden fırlatmalıdır', async () => {
      const originalUpdateOne = IdempotencyKey.updateOne;
      IdempotencyKey.updateOne = async () => {
        throw new Error('DB yazma hatası');
      };

      try {
        await assert.rejects(() => finalizeIdempotencyKey('key-8', 'completed'), /DB yazma hatası/);
      } finally {
        IdempotencyKey.updateOne = originalUpdateOne;
      }
    });
  });
});
