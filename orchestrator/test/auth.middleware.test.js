import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Merchant from '../src/models/Merchant.model.js';
import { hashApiKey } from '../src/utils/crypto.js';
import { authMiddleware } from '../src/api/middleware/auth.middleware.js';

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

describe('Auth Middleware Unit Tests', () => {
  it('Authorization header eksikse 401 döndürmeli ve next() ÇAĞRILMAMALIDIR', async () => {
    const req = createMockReq({});
    const res = createMockRes();
    let nextCalled = false;

    await authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'UNAUTHORIZED');
    assert.equal(nextCalled, false);
  });

  it('Bearer dışında bir şema 401 ile reddedilmelidir', async () => {
    const req = createMockReq({ Authorization: 'Basic dXNlcjpwYXNz' });
    const res = createMockRes();
    let nextCalled = false;

    await authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  it('Veritabanında eşleşmeyen API anahtarı 401 ile reddedilmelidir', async () => {
    const originalFindOne = Merchant.findOne;
    Merchant.findOne = () => ({ select: async () => null });

    const req = createMockReq({ Authorization: 'Bearer yanlis-anahtar' });
    const res = createMockRes();
    let nextCalled = false;

    try {
      await authMiddleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error, 'UNAUTHORIZED');
      assert.equal(nextCalled, false);
    } finally {
      Merchant.findOne = originalFindOne;
    }
  });

  it('Aktif olmayan üye işyeri 403 ile reddedilmelidir', async () => {
    const originalFindOne = Merchant.findOne;
    Merchant.findOne = () => ({
      select: async () => ({ _id: { toString: () => '507f1f77bcf86cd799439011' }, isActive: false }),
    });

    const req = createMockReq({ Authorization: 'Bearer bir-anahtar' });
    const res = createMockRes();
    let nextCalled = false;

    try {
      await authMiddleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.error, 'FORBIDDEN');
      assert.equal(nextCalled, false);
    } finally {
      Merchant.findOne = originalFindOne;
    }
  });

  it('Geçerli API anahtarı req.merchant/req.merchantId atamalı ve next() ÇAĞIRMALIDIR', async () => {
    const originalFindOne = Merchant.findOne;
    const fakeMerchant = { _id: { toString: () => '507f1f77bcf86cd799439011' }, isActive: true };
    let capturedFilter = null;

    Merchant.findOne = (filter) => {
      capturedFilter = filter;
      return { select: async () => fakeMerchant };
    };

    const apiKey = 'gecerli-api-anahtari';
    const req = createMockReq({ Authorization: `Bearer ${apiKey}` });
    const res = createMockRes();
    let nextCalled = false;

    try {
      await authMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, null, 'Başarılı doğrulamada response yazılmamalıdır');
      assert.equal(req.merchant, fakeMerchant);
      assert.equal(req.merchantId, '507f1f77bcf86cd799439011');
      // Kayıt anahtarı YA DA girişte verilen oturum anahtarı kabul edilir.
      assert.deepEqual(capturedFilter, {
        $or: [{ apiKeyHash: hashApiKey(apiKey) }, { sessionKeyHashes: hashApiKey(apiKey) }],
      });
    } finally {
      Merchant.findOne = originalFindOne;
    }
  });

  it('Merchant.findOne beklenmedik hata fırlatırsa 500 döndürmelidir', async () => {
    const originalFindOne = Merchant.findOne;
    Merchant.findOne = () => {
      throw new Error('DB bağlantı hatası');
    };

    const req = createMockReq({ Authorization: 'Bearer bir-anahtar' });
    const res = createMockRes();
    let nextCalled = false;

    try {
      await authMiddleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(res.statusCode, 500);
      assert.equal(nextCalled, false);
    } finally {
      Merchant.findOne = originalFindOne;
    }
  });
});
