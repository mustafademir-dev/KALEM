import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isStroops, stroopsToKurus, stroopsToFixed2, stroopsToTl } from '../src/utils/money.js';
import { sanitizeCartItems, cartMatchesTotal } from '../src/utils/cart-items.js';

describe('money.js', () => {
  it('stroopsToFixed2: stroop → TL, kuruşa yuvarlı, tam 2 ondalık', () => {
    assert.equal(stroopsToFixed2('50000000'), '5.00');
    assert.equal(stroopsToFixed2('10000000'), '1.00');
    assert.equal(stroopsToFixed2('12345000'), '1.23'); // 1,2345 → 1,23
    assert.equal(stroopsToFixed2('12350000'), '1.24'); // yarım kuruş yukarı
    assert.equal(stroopsToFixed2('0'), '0.00');
    assert.equal(stroopsToFixed2('1'), '0.00');
  });

  it('DÜZELTME KANITI: 5 TL (50.000.000 stroop) artık 50.000.000 TL değil', () => {
    assert.notEqual(stroopsToFixed2('50000000'), '50000000.00');
    assert.equal(stroopsToFixed2('50000000'), '5.00');
  });

  it('stroopsToKurus: 1 kuruş = 100.000 stroop', () => {
    assert.equal(stroopsToKurus('100000'), 1n);
    assert.equal(stroopsToKurus('49999'), 0n);
    assert.equal(stroopsToKurus('50000'), 1n);
  });

  it('stroopsToTl: anlamlı tüm ondalıklar korunur, sondaki sıfırlar atılır', () => {
    assert.equal(stroopsToTl('10000000'), '1');
    assert.equal(stroopsToTl('15000000'), '1.5');
    assert.equal(stroopsToTl('50000'), '0.005'); // %0,1 komisyon — sessizce yuvarlanmamalı
    assert.equal(stroopsToTl('1'), '0.0000001');
    assert.equal(stroopsToTl('10000000', { minDecimals: 2 }), '1.00');
    assert.equal(stroopsToTl('15000000', { minDecimals: 2, decimalSeparator: ',' }), '1,50');
    assert.equal(stroopsToTl('12500000000', { decimalSeparator: ',' }), '1250');
  });

  it('isStroops: yalnızca negatif olmayan tamsayı string', () => {
    assert.equal(isStroops('0'), true);
    assert.equal(isStroops('123'), true);
    for (const bad of ['-1', '1.5', '', 'abc', 12, null, undefined, '1e3']) assert.equal(isStroops(bad), false);
  });
});

describe('cart-items.js', () => {
  it('sanitizeCartItems: geçerli kalemleri korur, çöpü atar, ASLA hata fırlatmaz', () => {
    const cleaned = sanitizeCartItems([
      { name: '  Simit ', quantity: 2, price: '2500000' },
      { name: 'Çay', price: '1000000' }, // adet yok → 1
      { name: '', quantity: 1, price: '100' }, // isimsiz
      { name: 'X', quantity: 0, price: '100' }, // adet 0
      { name: 'X', quantity: 1.5, price: '100' }, // ondalık adet
      { name: 'X', quantity: 1, price: '-5' }, // negatif fiyat
      { name: 'X', quantity: 1, price: '0' }, // sıfır fiyat
      { name: 'X', quantity: 1, price: 250 }, // sayı (string değil)
      null,
      'metin',
    ]);
    assert.deepEqual(cleaned, [
      { name: 'Simit', quantity: 2, price: '2500000' },
      { name: 'Çay', quantity: 1, price: '1000000' },
    ]);
    for (const junk of [undefined, null, 'x', 5, {}, [[]]]) assert.deepEqual(sanitizeCartItems(junk), []);
  });

  it('sanitizeCartItems: en fazla 50 kalem, ad 120 karakter', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ name: `k${i}`, quantity: 1, price: '1' }));
    assert.equal(sanitizeCartItems(many).length, 50);
    assert.equal(sanitizeCartItems([{ name: 'a'.repeat(500), quantity: 1, price: '1' }])[0].name.length, 120);
  });

  it('cartMatchesTotal: yalnızca Σ birim fiyat × adet toplama TAM eşitse true', () => {
    const items = [
      { name: 'A', quantity: 1, price: '7500000' },
      { name: 'B', quantity: 1, price: '2500000' },
    ];
    assert.equal(cartMatchesTotal(items, '10000000'), true);
    assert.equal(cartMatchesTotal(items, '10000001'), false);
    assert.equal(cartMatchesTotal([{ name: 'A', quantity: 3, price: '100' }], '300'), true);
    assert.equal(cartMatchesTotal([], '0'), false);
    assert.equal(cartMatchesTotal(items, 'abc'), false);
  });
});
