/**
 * Client biçimlendirme testleri — RN bağımlılığı olmayan saf fonksiyonlar, `node --test client/test`
 * ile çalışır (client'ta ayrı bir test altyapısı yok).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTl, tlParts, dtlToStroops, stroopsToFixed2 } from '../src/utils/format.js';

describe('formatTl (1 dTL = 1 TL, ürün kararı)', () => {
  it('tam sayılar ondalıksız: 1 TL', () => {
    assert.equal(formatTl('10000000'), '1 TL');
    assert.equal(formatTl('0'), '0 TL');
    assert.equal(formatTl('500000000'), '50 TL');
  });

  it('kesirliler en az 2 haneli, virgüllü: 1,50 TL', () => {
    assert.equal(formatTl('15000000'), '1,50 TL');
    assert.equal(formatTl('12500000'), '1,25 TL');
    assert.equal(formatTl('17500000'), '1,75 TL');
  });

  it('binlik ayracı nokta: 1.250,75 TL', () => {
    assert.equal(formatTl('12507500000'), '1.250,75 TL');
    assert.equal(formatTl('12345678900000'), '1.234.567,89 TL');
    assert.equal(formatTl('10000000000'), '1.000 TL');
  });

  it('2 haneden fazla anlamlı basamak korunur (sessiz yuvarlama yok): 0,005 TL', () => {
    assert.equal(formatTl('50000'), '0,005 TL'); // %0,1 komisyon örneği
    assert.equal(formatTl('1'), '0,0000001 TL');
    assert.equal(formatTl('10000001'), '1,0000001 TL');
  });

  it('DÜZELTME KANITI: eski "1.0000000 dTL" biçimi artık üretilmez', () => {
    assert.equal(formatTl('10000000'), '1 TL');
    assert.doesNotMatch(formatTl('10000000'), /0000000|dTL/);
  });

  it('negatif (bakiye yetersiz) ve bigint girdisi', () => {
    assert.equal(formatTl('-9000000'), '-0,90 TL');
    assert.equal(formatTl(-9000000n), '-0,90 TL');
    assert.equal(formatTl(10000000n), '1 TL');
  });

  it('tlParts: bileşenlere ayrılır', () => {
    assert.deepEqual(tlParts('12507500000'), { negative: false, whole: '1.250', fraction: '75' });
    assert.deepEqual(tlParts('10000000'), { negative: false, whole: '1', fraction: null });
  });

  it('gidiş-dönüş: girilen TL → stroop → gösterilen TL', () => {
    assert.equal(formatTl(dtlToStroops('12.5')), '12,50 TL');
    assert.equal(formatTl(dtlToStroops('7')), '7 TL');
    assert.equal(formatTl(dtlToStroops('0.01')), '0,01 TL');
  });
});

describe('stroopsToFixed2 (fiş tutar karşılaştırması)', () => {
  it('sunucudaki GİB biçimiyle aynı: kuruşa yuvarlı, nokta ayraçlı', () => {
    assert.equal(stroopsToFixed2('50000000'), '5.00');
    assert.equal(stroopsToFixed2('12350000'), '1.24');
    assert.equal(stroopsToFixed2('0'), '0.00');
    assert.equal(stroopsToFixed2('1250000000'), '125.00');
  });
});
