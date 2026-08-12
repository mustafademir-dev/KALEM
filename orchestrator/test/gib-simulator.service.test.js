import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import GibDocument from '../src/models/GibDocument.model.js';
import { generateGibDocument } from '../src/services/gib-simulator.service.js';

describe('GİB Simulator Service Unit Tests', () => {
  const dummyTxHash = 'c133f5f007bd71971635c09ad7d1928ba3f570804b49fdc8095f644d35f8804d';
  const dummyTxId = '507f1f77bcf86cd799439011';

  it('generateGibDocument: UBL-TR uyumlu JSON taslağı üretmeli ve MongoDB kaydı yapmalıdır', async () => {
    const originalCreate = GibDocument.create;

    let createdData = null;
    GibDocument.create = async (docData) => {
      createdData = docData;
      return {
        _id: '607f1f77bcf86cd799439022',
        ...docData,
      };
    };

    try {
      const gibDoc = await generateGibDocument({
        txHash: dummyTxHash,
        transactionId: dummyTxId,
        merchantTaxId: '9876543210',
        totalAmountTL: '120.00',
        cartItems: [
          { name: 'Ürün A', price: 100, quantity: 1 },
        ],
      });

      assert.ok(gibDoc, 'GİB belgesi döndürülmelidir');
      assert.equal(createdData.txHash, dummyTxHash);
      assert.equal(createdData.merchantTaxId, '9876543210');
      assert.equal(createdData.status, 'generated');

      // UBL-TR Yapısı Doğrulaması
      const invoice = createdData.ublContent.Invoice;
      assert.equal(invoice.UBLVersionID, '2.1');
      assert.equal(invoice.ProfileID, 'TICARIFATURA');
      assert.equal(invoice.InvoiceTypeCode, 'SATIS');
      assert.equal(invoice.AdditionalDocumentReference.ID, dummyTxHash);

      // XML Çıktısı Doğrulaması
      assert.ok(createdData.xmlContent.includes('<StellarTxHash>' + dummyTxHash + '</StellarTxHash>'));
    } finally {
      GibDocument.create = originalCreate;
    }
  });
});
