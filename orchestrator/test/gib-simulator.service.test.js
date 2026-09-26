import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import GibDocument from '../src/models/GibDocument.model.js';
import { generateGibDocument } from '../src/services/gib-simulator.service.js';

/** GibDocument.create'i yakalayıp üretilen belgeyi döndürür. */
async function generate(params) {
  const originalCreate = GibDocument.create;
  let createdData = null;
  GibDocument.create = async (docData) => {
    createdData = docData;
    return { _id: '607f1f77bcf86cd799439022', ...docData };
  };
  try {
    await generateGibDocument({
      txHash: 'c133f5f007bd71971635c09ad7d1928ba3f570804b49fdc8095f644d35f8804d',
      transactionId: '507f1f77bcf86cd799439011',
      ...params,
    });
    return createdData;
  } finally {
    GibDocument.create = originalCreate;
  }
}

describe('GİB Simulator Service Unit Tests', () => {
  const dummyTxHash = 'c133f5f007bd71971635c09ad7d1928ba3f570804b49fdc8095f644d35f8804d';

  it('UBL-TR uyumlu JSON taslağı üretmeli ve MongoDB kaydı yapmalıdır', async () => {
    const doc = await generate({ merchantTaxId: '9876543210', totalAmountStroops: '1200000000' });

    assert.equal(doc.txHash, dummyTxHash);
    assert.equal(doc.merchantTaxId, '9876543210');
    assert.equal(doc.status, 'generated');

    const invoice = doc.ublContent.Invoice;
    assert.equal(invoice.UBLVersionID, '2.1');
    assert.equal(invoice.InvoiceTypeCode, 'SATIS');
    assert.equal(invoice.AdditionalDocumentReference.ID, dummyTxHash);
    assert.ok(doc.xmlContent.includes('<StellarTxHash>' + dummyTxHash + '</StellarTxHash>'));
  });

  it('GMÖEBYS: belge ÖKC fişi değil, esnaf VKN\'siyle ve NİHAİ TÜKETİCİ alıcılı e-Arşiv Fatura', async () => {
    const doc = await generate({ merchantTaxId: '9876543210', merchantName: 'Kadıköy Simit', totalAmountStroops: '50000000' });
    const invoice = doc.ublContent.Invoice;

    assert.equal(doc.documentType, 'e_arsiv');
    assert.equal(invoice.ProfileID, 'EARSIVFATURA');
    assert.equal(invoice.AccountingSupplierParty.Party.PartyIdentification[0].ID.value, '9876543210');
    assert.equal(invoice.AccountingSupplierParty.Party.PartyName.Name, 'Kadıköy Simit');
    assert.equal(invoice.AccountingCustomerParty.Party.PartyName.Name, 'NİHAİ TÜKETİCİ');
    assert.match(invoice.Note[0], /507 Sıra No/);
    assert.match(doc.xmlContent, /<ProfileID>EARSIVFATURA<\/ProfileID>/);
  });

  it('DÜZELTME A: stroop TL sayılmaz — 5 TL (50.000.000 stroop) fişte 5,00 TL olmalı, 50.000.000 değil', async () => {
    const doc = await generate({ totalAmountStroops: '50000000' });
    const total = doc.ublContent.Invoice.LegalMonetaryTotal;

    assert.equal(total.PayableAmount, '5.00');
    assert.equal(total.TaxInclusiveAmount, '5.00');
    assert.equal(total.TaxExclusiveAmount, '4.17'); // 5 / 1,20
    assert.equal(doc.ublContent.Invoice.TaxTotal.TaxAmount, '0.83');
    assert.equal(doc.totalAmountTL, '5.00');
    assert.match(doc.xmlContent, /<TotalAmount currencyID="TRY">5\.00<\/TotalAmount>/);
  });

  it('matrah + KDV her zaman toplama TAM eşit (kuruş kaybı yok)', async () => {
    for (const stroops of ['10000000', '33333333', '12345678', '99999999', '150000', '7']) {
      const doc = await generate({ totalAmountStroops: stroops });
      const inv = doc.ublContent.Invoice;
      const cents = (s) => BigInt(s.replace('.', ''));
      assert.equal(
        cents(inv.LegalMonetaryTotal.TaxExclusiveAmount) + cents(inv.TaxTotal.TaxAmount),
        cents(inv.LegalMonetaryTotal.PayableAmount),
        `${stroops} stroop için matrah+KDV != toplam`
      );
    }
  });

  it('DÜZELTME B: belgeye GERÇEK esnaf adı ve VKN yazılır; verilmezse varsayılan simülasyon değerleri', async () => {
    const real = await generate({
      merchantTaxId: '1234567890',
      merchantName: 'Kadıköy Simit Fırını',
      totalAmountStroops: '10000000',
    });
    const party = real.ublContent.Invoice.AccountingSupplierParty.Party;
    assert.equal(party.PartyName.Name, 'Kadıköy Simit Fırını');
    assert.equal(party.PartyIdentification[0].ID.value, '1234567890');
    assert.match(real.xmlContent, /<SupplierVKN>1234567890<\/SupplierVKN>/);

    const fallback = await generate({ totalAmountStroops: '10000000' });
    assert.equal(fallback.ublContent.Invoice.AccountingSupplierParty.Party.PartyName.Name, 'KALEM Entegre Üye İşyeri');
  });

  it('DÜZELTME C: sepet toplamla TAM tutuyorsa satırlara yansır; Σ satır == matrah (kuruşu kuruşuna)', async () => {
    const doc = await generate({
      totalAmountStroops: '10000000', // 1 TL
      cartItems: [
        { name: 'A4 Fotokopi Kağıdı', quantity: 1, price: '7500000' },
        { name: 'Jel Kalem Seti', quantity: 1, price: '2500000' },
      ],
    });
    const lines = doc.ublContent.Invoice.InvoiceLine;
    assert.equal(lines.length, 2);
    assert.equal(lines[0].Item.Name, 'A4 Fotokopi Kağıdı');
    assert.equal(lines[1].Item.Name, 'Jel Kalem Seti');
    const cents = (s) => BigInt(s.replace('.', ''));
    const sum = lines.reduce((acc, l) => acc + cents(l.LineExtensionAmount), 0n);
    assert.equal(sum, cents(doc.ublContent.Invoice.LegalMonetaryTotal.TaxExclusiveAmount));
    assert.equal(doc.ublContent.Invoice.LineCountNumeric, 2);
  });

  it('sepet toplamla TUTMUYORSA satırlar kullanılmaz — tek "Genel Perakende Satış" satırı', async () => {
    const doc = await generate({
      totalAmountStroops: '10000000',
      cartItems: [{ name: 'Uydurma', quantity: 1, price: '99999999' }],
    });
    const lines = doc.ublContent.Invoice.InvoiceLine;
    assert.equal(lines.length, 1);
    assert.equal(lines[0].Item.Name, 'Genel Perakende Satış');
  });
});
