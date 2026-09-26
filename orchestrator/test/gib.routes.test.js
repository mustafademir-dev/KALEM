import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Transaction from '../src/models/Transaction.model.js';
import GibDocument from '../src/models/GibDocument.model.js';
import Merchant from '../src/models/Merchant.model.js';
import { hashApiKey } from '../src/utils/crypto.js';
import { getGibDocumentHandler } from '../src/api/routes/gib.routes.js';

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

function createMockReq({ txHash = 'hash-1', headers = {}, query = {} } = {}) {
  return {
    params: { txHash },
    query,
    get(name) {
      return headers[name];
    },
  };
}

describe('GİB Routes Unit Tests', () => {
  describe('getGibDocumentHandler', () => {
    it('işlem bulunamazsa 404 döndürmelidir', async () => {
      const original = Transaction.findOne;
      Transaction.findOne = async () => null;

      try {
        const req = createMockReq();
        const res = createMockRes();
        await getGibDocumentHandler(req, res);
        assert.equal(res.statusCode, 404);
        assert.equal(res.body.error, 'NOT_FOUND');
      } finally {
        Transaction.findOne = original;
      }
    });

    describe('esnaf (Bearer) yolu', () => {
      it('geçersiz API anahtarı 401 döndürmelidir', async () => {
        const originalTx = Transaction.findOne;
        const originalMerchant = Merchant.findOne;
        Transaction.findOne = async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          merchantId: { toString: () => '507f1f77bcf86cd799439022' },
          senderAddress: 'GSENDER',
        });
        Merchant.findOne = () => ({ select: async () => null });

        try {
          const req = createMockReq({ headers: { Authorization: 'Bearer yanlis-anahtar' } });
          const res = createMockRes();
          await getGibDocumentHandler(req, res);
          assert.equal(res.statusCode, 401);
          assert.equal(res.body.error, 'UNAUTHORIZED');
        } finally {
          Transaction.findOne = originalTx;
          Merchant.findOne = originalMerchant;
        }
      });

      it('başka bir esnafın işlemine erişmeye çalışırsa 403 döndürmelidir', async () => {
        const originalTx = Transaction.findOne;
        const originalMerchant = Merchant.findOne;
        Transaction.findOne = async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          merchantId: { toString: () => 'baska-esnaf-id' },
          senderAddress: 'GSENDER',
        });
        Merchant.findOne = () => ({
          select: async () => ({ _id: { toString: () => 'kimlik-dogrulanan-esnaf-id' }, isActive: true }),
        });

        try {
          const req = createMockReq({ headers: { Authorization: 'Bearer gecerli-anahtar' } });
          const res = createMockRes();
          await getGibDocumentHandler(req, res);
          assert.equal(res.statusCode, 403);
          assert.equal(res.body.error, 'FORBIDDEN');
        } finally {
          Transaction.findOne = originalTx;
          Merchant.findOne = originalMerchant;
        }
      });

      it('kendi işlemi için belge bulunamazsa 404 döndürmelidir', async () => {
        const originalTx = Transaction.findOne;
        const originalMerchant = Merchant.findOne;
        const originalGib = GibDocument.findOne;
        Transaction.findOne = async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          merchantId: { toString: () => 'esnaf-id' },
          senderAddress: 'GSENDER',
        });
        Merchant.findOne = () => ({ select: async () => ({ _id: { toString: () => 'esnaf-id' }, isActive: true }) });
        GibDocument.findOne = async () => null;

        try {
          const req = createMockReq({ headers: { Authorization: 'Bearer gecerli-anahtar' } });
          const res = createMockRes();
          await getGibDocumentHandler(req, res);
          assert.equal(res.statusCode, 404);
        } finally {
          Transaction.findOne = originalTx;
          Merchant.findOne = originalMerchant;
          GibDocument.findOne = originalGib;
        }
      });

      it('kendi işleminin belgesini 200 ile döndürmelidir', async () => {
        const originalTx = Transaction.findOne;
        const originalMerchant = Merchant.findOne;
        const originalGib = GibDocument.findOne;
        Transaction.findOne = async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          merchantId: { toString: () => 'esnaf-id' },
          senderAddress: 'GSENDER',
        });
        const plainApiKey = 'gercek-api-anahtari';
        let capturedFilter = null;
        // authMiddleware'deki gibi .select('+apiKeyHash') zinciri destekleniyor.
        Merchant.findOne = (filter) => {
          capturedFilter = filter;
          return { select: async () => ({ _id: { toString: () => 'esnaf-id' }, isActive: true }) };
        };

        GibDocument.findOne = async () => ({
          txHash: 'hash-1',
          documentType: 'okc_fis',
          status: 'generated',
          merchantTaxId: '1234567890',
          totalAmountTL: '10000000',
          ublContent: { Invoice: { ID: 'KALEM123' } },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        });

        try {
          const req = createMockReq({ txHash: 'hash-1', headers: { Authorization: `Bearer ${plainApiKey}` } });
          const res = createMockRes();
          await getGibDocumentHandler(req, res);
          assert.equal(res.statusCode, 200);
          assert.equal(res.body.transactionId, '507f1f77bcf86cd799439011');
          assert.equal(res.body.txHash, 'hash-1');
          assert.equal(res.body.ublContent.Invoice.ID, 'KALEM123');
          // Kayıt anahtarı VE şifreyle girişte verilen oturum anahtarı kabul edilir
          // (authMiddleware ile aynı kural; aksi halde VKN+şifreyle giren esnaf 401 alıyordu).
          assert.deepEqual(capturedFilter, {
            $or: [{ apiKeyHash: hashApiKey(plainApiKey) }, { sessionKeyHashes: hashApiKey(plainApiKey) }],
          });
        } finally {
          Transaction.findOne = originalTx;
          Merchant.findOne = originalMerchant;
          GibDocument.findOne = originalGib;
        }
      });
    });

    describe('müşteri (senderAddress) yolu', () => {
      it('Authorization yok, senderAddress query de yoksa 403 döndürmelidir', async () => {
        const originalTx = Transaction.findOne;
        Transaction.findOne = async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          merchantId: { toString: () => 'esnaf-id' },
          senderAddress: 'GSENDER',
        });

        try {
          const req = createMockReq(); // headers boş, query boş
          const res = createMockRes();
          await getGibDocumentHandler(req, res);
          assert.equal(res.statusCode, 403);
        } finally {
          Transaction.findOne = originalTx;
        }
      });

      it('senderAddress işlemin gerçek göndereniyle eşleşmiyorsa 403 döndürmelidir', async () => {
        const originalTx = Transaction.findOne;
        Transaction.findOne = async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          merchantId: { toString: () => 'esnaf-id' },
          senderAddress: 'GGERCEK_GONDEREN',
        });

        try {
          const req = createMockReq({ query: { senderAddress: 'GBASKA_ADRES' } });
          const res = createMockRes();
          await getGibDocumentHandler(req, res);
          assert.equal(res.statusCode, 403);
        } finally {
          Transaction.findOne = originalTx;
        }
      });

      it('senderAddress eşleşirse belgeyi 200 ile döndürmelidir (imza gerekmeden)', async () => {
        const originalTx = Transaction.findOne;
        const originalGib = GibDocument.findOne;
        Transaction.findOne = async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          merchantId: { toString: () => 'esnaf-id' },
          senderAddress: 'GGERCEK_GONDEREN',
        });
        GibDocument.findOne = async () => ({
          txHash: 'hash-1',
          documentType: 'okc_fis',
          status: 'generated',
          merchantTaxId: '1234567890',
          totalAmountTL: '5000000',
          ublContent: { Invoice: { ID: 'KALEM456' } },
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        });

        try {
          const req = createMockReq({ query: { senderAddress: 'GGERCEK_GONDEREN' } });
          const res = createMockRes();
          await getGibDocumentHandler(req, res);
          assert.equal(res.statusCode, 200);
          assert.equal(res.body.ublContent.Invoice.ID, 'KALEM456');
        } finally {
          Transaction.findOne = originalTx;
          GibDocument.findOne = originalGib;
        }
      });
    });
  });
});
