/**
 * İstemci KDV yardımcıları — sunucudaki hesapla AYNI sonuç vermeli.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vatSplit, kurusToTl, vatLines } from '../src/utils/vat.js';

describe('vatSplit', () => {
  it('110 TL %10 → matrah 100, KDV 10; 101 TL %1 → 100 / 1', () => {
    assert.deepEqual(vatSplit('1100000000', 10), { exclKurus: 10000n, vatKurus: 1000n });
    assert.deepEqual(vatSplit('1010000000', 1), { exclKurus: 10000n, vatKurus: 100n });
  });
  it('%20: sunucunun eski formülüyle aynı ((k*5+3)/6)', () => {
    for (const stroops of ['10000000', '123450000', '999999999']) {
      const k = (BigInt(stroops) + 50000n) / 100000n;
      assert.equal(vatSplit(stroops, 20).exclKurus, (k * 5n + 3n) / 6n);
    }
  });
  it('tutar yoksa null', () => assert.equal(vatSplit(null, 20), null));
});

describe('kurusToTl / vatLines', () => {
  it('kuruş → TL biçimi', () => {
    assert.equal(kurusToTl(123450n), '1.234,50');
    assert.equal(kurusToTl(5n), '0,05');
  });
  it('yeni belge (dizi) ve eski belge (tek nesne, %20)', () => {
    assert.deepEqual(vatLines({ TaxTotal: { TaxSubtotal: [{ Percent: 1, TaxAmount: '0.20' }, { Percent: 20, TaxAmount: '5.00' }] } }), [
      { percent: 1, amount: '0.20' },
      { percent: 20, amount: '5.00' },
    ]);
    assert.deepEqual(vatLines({ TaxTotal: { TaxAmount: '1.00', TaxSubtotal: { Percent: 20, TaxAmount: '1.00' } } }), [
      { percent: 20, amount: '1.00' },
    ]);
    assert.deepEqual(vatLines({ TaxTotal: { TaxAmount: '1.00' } }), [{ percent: 20, amount: '1.00' }]);
  });
});
