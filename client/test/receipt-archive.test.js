import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveKey,
  packArchive,
  parseArchive,
  receiptFilename,
  receiptToText,
  summarizeArchive,
  upsertEntry,
  MAX_ENTRIES,
  STAMP,
} from '../src/utils/receiptArchive.js';

const entry = (txHash, paidAt, extra = {}) => ({
  txHash,
  paidAt,
  totalAmount: '10000000',
  businessName: 'Örnek Market',
  ...extra,
});

describe('parseArchive (bozuk veriye dayanıklılık)', () => {
  it('boş/bozuk girdide ASLA hata fırlatmaz, boş liste döner', () => {
    assert.deepEqual(parseArchive(null), []);
    assert.deepEqual(parseArchive(undefined), []);
    assert.deepEqual(parseArchive(''), []);
    assert.deepEqual(parseArchive('{bozuk json'), []);
    assert.deepEqual(parseArchive('"dizi değil"'), []);
    assert.deepEqual(parseArchive('{"a":1}'), []);
  });

  it('geçersiz kayıtları eler, geçerlileri korur', () => {
    const raw = JSON.stringify([
      entry('aaa', '2026-09-20T10:00:00.000Z'),
      { txHash: '', paidAt: '2026-09-20T10:00:00.000Z' }, // boş hash
      { txHash: 'bbb' }, // paidAt yok
      null,
      'metin',
    ]);
    const parsed = parseArchive(raw);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].txHash, 'aaa');
  });
});

describe('upsertEntry (tekrar engelleme ve sıralama)', () => {
  it('aynı txHash iki kez eklenirse listede bir kez kalır (idempotent)', () => {
    const list = upsertEntry([], entry('aaa', '2026-09-20T10:00:00.000Z'));
    const again = upsertEntry(list, entry('aaa', '2026-09-20T10:00:00.000Z', { businessName: 'Yeni Ad' }));
    assert.equal(again.length, 1);
    assert.equal(again[0].businessName, 'Yeni Ad', 'yeni kayıt eskisinin yerini almalı');
  });

  it('liste her zaman yeniden eskiye sıralıdır', () => {
    let list = [];
    list = upsertEntry(list, entry('eski', '2026-09-18T10:00:00.000Z'));
    list = upsertEntry(list, entry('yeni', '2026-09-20T10:00:00.000Z'));
    list = upsertEntry(list, entry('orta', '2026-09-19T10:00:00.000Z'));
    assert.deepEqual(
      list.map((i) => i.txHash),
      ['yeni', 'orta', 'eski']
    );
  });

  it('girdi listesini değiştirmez ve geçersiz kaydı eklemez', () => {
    const original = [entry('aaa', '2026-09-20T10:00:00.000Z')];
    const copy = [...original];
    const result = upsertEntry(original, { txHash: '' });
    assert.deepEqual(original, copy, 'girdi listesi mutasyona uğramamalı');
    assert.equal(result.length, 1);
  });
});

describe('packArchive (sayı ve bayt sınırları)', () => {
  const many = (n) =>
    Array.from({ length: n }, (_, i) =>
      entry(`hash-${String(i).padStart(3, '0')}`, `2026-09-20T10:${String(i % 60).padStart(2, '0')}:00.000Z`)
    );

  it('kayıt sayısı tavanı aşılmaz', () => {
    const { kept } = packArchive(many(MAX_ENTRIES + 15), { maxBytes: 10_000_000 });
    assert.equal(kept.length, MAX_ENTRIES);
  });

  it('bayt bütçesi aşılırsa EN ESKİ kayıtlar düşer, en yeni korunur', () => {
    const list = many(30);
    const { json, kept, dropped } = packArchive(list, { maxBytes: 600 });
    assert.ok(Buffer.byteLength(json, 'utf8') <= 600, 'bütçe aşılmamalı');
    assert.ok(dropped > 0, 'bir şeyler düşmeli');
    assert.equal(kept[0].txHash, list[0].txHash, 'listenin başı (en yeni) korunmalı');
  });

  it('tek kayıt bütçeyi aşsa bile kaydedilir (yeni fiş asla kaybolmaz)', () => {
    const { kept } = packArchive([entry('a'.repeat(400), '2026-09-20T10:00:00.000Z')], { maxBytes: 10 });
    assert.equal(kept.length, 1);
  });

  it('çıktı JSON tekrar okunabilir', () => {
    const { json } = packArchive(many(5));
    assert.equal(parseArchive(json).length, 5);
  });
});

describe('summarizeArchive (ana sayfa özeti)', () => {
  const now = new Date('2026-09-20T10:00:00Z'); // Türkiye: 20 Eylül 2026

  it('boş arşivde sıfırlanmış özet döner', () => {
    assert.deepEqual(summarizeArchive([], { now }), {
      monthTotal: '0',
      monthCount: 0,
      totalCount: 0,
      lastPaidAt: null,
    });
    assert.equal(summarizeArchive(null, { now }).monthCount, 0);
  });

  it('ay sınırı TÜRKİYE saatine göre belirlenir (UTC 21:00 sonrası ertesi gün)', () => {
    const list = [
      entry('eylul-basi', '2026-08-31T21:00:00.000Z', { totalAmount: '10000000' }), // TR: 1 Eylül → İÇERİDE
      entry('agustos-sonu', '2026-08-31T20:59:59.000Z', { totalAmount: '50000000' }), // TR: 31 Ağustos → DIŞARIDA
    ];
    const s = summarizeArchive(list, { now });
    assert.equal(s.monthCount, 1, 'yalnızca eylüldeki işlem sayılmalı');
    assert.equal(s.monthTotal, '10000000');
    assert.equal(s.totalCount, 2, 'toplam sayı ayla sınırlı değildir');
  });

  it('bu ayın tutarlarını toplar ve en son ödemeyi bulur', () => {
    const list = [
      entry('a', '2026-09-02T08:00:00.000Z', { totalAmount: '10000000' }),
      entry('b', '2026-09-19T08:00:00.000Z', { totalAmount: '25000000' }),
      entry('c', '2026-07-01T08:00:00.000Z', { totalAmount: '99000000' }),
    ];
    const s = summarizeArchive(list, { now });
    assert.equal(s.monthTotal, '35000000');
    assert.equal(s.monthCount, 2);
    assert.equal(s.lastPaidAt, '2026-09-19T08:00:00.000Z');
  });

  it('tutarı okunamayan kayıt SAYILIR ama toplama katılmaz', () => {
    const list = [
      entry('iyi', '2026-09-10T08:00:00.000Z', { totalAmount: '10000000' }),
      entry('bozuk', '2026-09-11T08:00:00.000Z', { totalAmount: 'abc' }),
      entry('eksik', '2026-09-12T08:00:00.000Z', { totalAmount: undefined }),
    ];
    const s = summarizeArchive(list, { now });
    assert.equal(s.monthCount, 3);
    assert.equal(s.monthTotal, '10000000');
  });

  it('geçersiz tarihli kayıt özeti bozmaz', () => {
    const s = summarizeArchive([entry('kotu', 'tarih-değil', { totalAmount: '10000000' })], { now });
    assert.equal(s.monthCount, 0);
    assert.equal(s.lastPaidAt, null);
    assert.equal(s.totalCount, 1);
  });
});

describe('archiveKey (cüzdan başına ayrı arşiv)', () => {
  it('farklı adresler farklı anahtar üretir', () => {
    assert.notEqual(archiveKey('GAAA'), archiveKey('GBBB'));
  });

  it('yalnızca depo katmanının kabul ettiği karakterleri bırakır', () => {
    assert.match(archiveKey('GA/B+C=D'), /^[A-Za-z0-9._-]+$/);
  });
});

describe('receiptFilename', () => {
  it('dosya adında SİMÜLASYON ibaresi ve tarih geçer', () => {
    const name = receiptFilename({ txHash: 'abcdef1234567890', paidAt: '2026-09-20T10:00:00.000Z' });
    assert.ok(name.includes('SIMULASYON'), 'dosya adı damga taşımalı');
    assert.ok(name.includes('2026-09-20'));
    assert.ok(name.endsWith('.txt'));
  });

  it('tarih/hash yoksa bile geçerli bir ad üretir', () => {
    assert.equal(receiptFilename({}), 'kalem-fis-SIMULASYON-tarihsiz-fis.txt');
  });
});

describe('receiptToText', () => {
  const document = {
    txHash: 'abc123',
    merchantTaxId: '1234567890',
    ublContent: {
      Invoice: {
        ID: 'KLM-001',
        IssueDate: '2026-09-20',
        IssueTime: '13:17',
        AccountingSupplierParty: { Party: { PartyName: { Name: 'Örnek Market' } } },
        InvoiceLine: [
          { InvoicedQuantity: 2, Item: { Name: 'Ekmek' }, LineExtensionAmount: '10.00' },
          { InvoicedQuantity: 1, Item: { Name: 'Süt' }, LineExtensionAmount: '25.50' },
        ],
        TaxTotal: { TaxAmount: '5.92' },
        LegalMonetaryTotal: { TaxExclusiveAmount: '29.58', PayableAmount: '35.50' },
      },
    },
  };

  it('damga hem başta hem sonda yer alır', () => {
    const text = receiptToText(document);
    assert.ok(text.startsWith(STAMP), 'metin damgayla başlamalı');
    assert.ok(text.trimEnd().includes(STAMP), 'metin damgayla bitmeli');
    assert.equal(text.split(STAMP).length - 1, 2, 'damga iki kez geçmeli');
  });

  it('işyeri, VKN, kalemler ve toplam metne girer', () => {
    const text = receiptToText(document);
    assert.ok(text.includes('Örnek Market'));
    assert.ok(text.includes('1234567890'));
    assert.ok(text.includes('2x Ekmek'), 'adet 1den büyükse gösterilmeli');
    assert.ok(text.includes('Süt'));
    assert.ok(!text.includes('1x Süt'), 'adet 1 ise çarpan yazılmamalı');
    assert.ok(text.includes('35.50 TL'));
    assert.ok(text.includes('abc123'));
  });

  it('uyarı verilirse metnin başına yazılır', () => {
    const text = receiptToText(document, { warning: 'Bu fiş eski biçimde üretildi.' });
    assert.ok(text.includes('Bu fiş eski biçimde üretildi.'));
    assert.ok(text.indexOf('Bu fiş eski') < text.indexOf('Örnek Market'), 'uyarı fiş gövdesinden önce gelmeli');
  });

  it('belge okunamazsa hata fırlatmaz, damgalı bir metin döner', () => {
    for (const bad of [null, undefined, {}, { ublContent: {} }]) {
      const text = receiptToText(bad);
      assert.ok(text.includes(STAMP));
      assert.ok(text.includes('okunamadı'));
    }
  });

  it('kalem listesi tek nesne olarak gelirse de çalışır (UBL tek satır durumu)', () => {
    const single = {
      ...document,
      ublContent: {
        Invoice: { ...document.ublContent.Invoice, InvoiceLine: { Item: { Name: 'Tek Ürün' }, LineExtensionAmount: '5.00' } },
      },
    };
    assert.ok(receiptToText(single).includes('Tek Ürün'));
  });
});
