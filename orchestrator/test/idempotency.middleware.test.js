import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { v1 as uuidv1, v4 as uuidv4 } from 'uuid';
import IdempotencyKey from '../src/models/IdempotencyKey.model.js';
import { idempotencyMiddleware } from '../src/api/middleware/idempotency.middleware.js';

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

function createMockReq(headers = {}) {
  return {
    get(name) {
      return headers[name] ?? headers[name.toLowerCase()];
    },
  };
}

function e11000() {
  const err = new Error('E11000 duplicate key error');
  err.code = 11000;
  return err;
}

describe('Idempotency Middleware Unit Tests', () => {
  it('Idempotency-Key header eksikse 400 döndürmeli ve next() ÇAĞRILMAMALIDIR', async () => {
    const req = createMockReq({});
    const res = createMockRes();
    let nextCalled = false;

    await idempotencyMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 400);
    assert.equal(nextCalled, false);
  });

  it('UUID formatında olmayan bir key 400 döndürmelidir', async () => {
    const req = createMockReq({ 'Idempotency-Key': 'not-a-uuid' });
    const res = createMockRes();
    let nextCalled = false;

    await idempotencyMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 400);
    assert.equal(nextCalled, false);
  });

  it('v4 olmayan (v1) geçerli bir UUID 400 döndürmelidir', async () => {
    const req = createMockReq({ 'Idempotency-Key': uuidv1() });
    const res = createMockRes();
    let nextCalled = false;

    await idempotencyMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 400);
    assert.equal(nextCalled, false);
  });

  it('Yeni key ile req.idempotencyKey atamalı ve next() ÇAĞIRMALIDIR', async () => {
    const originalCreate = IdempotencyKey.create;
    IdempotencyKey.create = async () => ({});

    const key = uuidv4();
    const req = createMockReq({ 'Idempotency-Key': key });
    const res = createMockRes();
    let nextCalled = false;

    try {
      await idempotencyMiddleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      assert.equal(req.idempotencyKey, key);
      assert.equal(res.statusCode, null, 'Yeni key kabul edilirken response yazılmamalıdır');
    } finally {
      IdempotencyKey.create = originalCreate;
    }
  });

  it('processing durumundaki key 409 döndürmeli, ağa gitmemeli ve next() ÇAĞRILMAMALIDIR', async () => {
    const originalCreate = IdempotencyKey.create;
    const originalFindOne = IdempotencyKey.findOne;
    IdempotencyKey.create = async () => {
      throw e11000();
    };
    IdempotencyKey.findOne = async () => ({ status: 'processing' });

    const req = createMockReq({ 'Idempotency-Key': uuidv4() });
    const res = createMockRes();
    let nextCalled = false;

    try {
      await idempotencyMiddleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.error, 'CONFLICT');
      assert.equal(nextCalled, false);
    } finally {
      IdempotencyKey.create = originalCreate;
      IdempotencyKey.findOne = originalFindOne;
    }
  });

  it('completed durumundaki key saklanan sonucu 200 ile REPLAY etmeli (ağa ikinci kez gitmeden) ve next() ÇAĞRILMAMALIDIR', async () => {
    const originalCreate = IdempotencyKey.create;
    const originalFindOne = IdempotencyKey.findOne;
    const cachedResult = { transactionId: '507f1f77bcf86cd799439011', status: 'submitted' };
    IdempotencyKey.create = async () => {
      throw e11000();
    };
    IdempotencyKey.findOne = async () => ({ status: 'completed', result: cachedResult });

    const req = createMockReq({ 'Idempotency-Key': uuidv4() });
    const res = createMockRes();
    let nextCalled = false;

    try {
      await idempotencyMiddleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, cachedResult);
      assert.equal(nextCalled, false);
    } finally {
      IdempotencyKey.create = originalCreate;
      IdempotencyKey.findOne = originalFindOne;
    }
  });

  it('acquireIdempotencyLock beklenmedik hata fırlatırsa 500 döndürmelidir', async () => {
    const originalCreate = IdempotencyKey.create;
    IdempotencyKey.create = async () => {
      throw new Error('DB bağlantı hatası');
    };

    const req = createMockReq({ 'Idempotency-Key': uuidv4() });
    const res = createMockRes();
    let nextCalled = false;

    try {
      await idempotencyMiddleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(res.statusCode, 500);
      assert.equal(nextCalled, false);
    } finally {
      IdempotencyKey.create = originalCreate;
    }
  });
});
