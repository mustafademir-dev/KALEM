import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { istanbulToday, shiftDate, formatTrDate, formatTrClock, formatTrDateTime } from '../src/utils/dates.js';
import { pressKey, toStroops, displayParts } from '../src/utils/amountInput.js';

describe('dates.js (Türkiye saati, UTC+3)', () => {
  it('istanbulToday: UTC 21:00 sonrası ertesi gün', () => {
    assert.equal(istanbulToday(new Date('2026-09-19T20:59:59Z')), '2026-09-19');
    assert.equal(istanbulToday(new Date('2026-09-19T21:00:00Z')), '2026-09-20');
  });

  it('shiftDate: ay ve yıl sınırlarını doğru geçer', () => {
    assert.equal(shiftDate('2026-09-19', 1), '2026-09-20');
    assert.equal(shiftDate('2026-09-30', 1), '2026-10-01');
    assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
    assert.equal(shiftDate('2028-02-28', 1), '2028-02-29'); // artık yıl
  });

  it('formatTrDate / formatTrClock / formatTrDateTime', () => {
    assert.equal(formatTrDate('2026-09-19'), '19 Eylül 2026');
    assert.equal(formatTrClock('2026-09-19T10:05:07.000Z'), '13:05');
    assert.equal(formatTrDateTime('2026-09-19T10:05:07.000Z'), '19 Eyl · 13:05');
    // gece yarısı sınırı: 21:00Z Türkiye'de ertesi günün 00:00'ı
    assert.equal(formatTrDateTime('2026-09-19T21:00:00.000Z'), '20 Eyl · 00:00');
  });
});

describe('amountInput.js (tutar klavyesi)', () => {
  const type = (...keys) => keys.reduce((text, k) => pressKey(text, k), '');

  it('rakamlar birikir; baştaki sıfırlar toplanmaz', () => {
    assert.equal(type('1', '2', '5'), '125');
    assert.equal(type('0', '0', '0'), '0');
    assert.equal(type('0', '7'), '7');
  });

  it('virgül: en fazla bir tane; boşken "0," olur', () => {
    assert.equal(type(','), '0,');
    assert.equal(type('1', ',', ','), '1,');
    assert.equal(type('1', '2', ',', '5'), '12,5');
  });

  it('en fazla 2 ondalık (kuruş) ve 9 tam basamak', () => {
    assert.equal(type('1', ',', '2', '3', '4'), '1,23');
    assert.equal(type(...'1234567890'.split('')), '123456789'); // 10. rakam yok sayılır
  });

  it('geri ve temizle', () => {
    assert.equal(type('1', '2', 'back'), '1');
    assert.equal(type('1', ',', '5', 'back', 'back'), '1');
    assert.equal(type('back'), '');
    assert.equal(type('1', '2', 'clear'), '');
  });

  it('geçersiz tuşlar yok sayılır', () => {
    assert.equal(pressKey('12', 'x'), '12');
    assert.equal(pressKey('12', '-'), '12');
  });

  it('toStroops: TL → stroop (1 TL = 10.000.000 stroop); boş/sıfır null', () => {
    assert.equal(toStroops('1'), '10000000');
    assert.equal(toStroops('12,5'), '125000000');
    assert.equal(toStroops('12,'), '120000000');
    assert.equal(toStroops('0,01'), '100000');
    assert.equal(toStroops('1250'), '12500000000');
    for (const zero of ['', '0', '0,', '0,00']) assert.equal(toStroops(zero), null, JSON.stringify(zero));
    assert.equal(toStroops('abc'), null);
  });

  it('displayParts: binlik ayracı; kullanıcı ne yazdıysa o görünür', () => {
    assert.deepEqual(displayParts(''), { whole: '0', fraction: '', hasComma: false });
    assert.deepEqual(displayParts('1250'), { whole: '1.250', fraction: '', hasComma: false });
    assert.deepEqual(displayParts('12,'), { whole: '12', fraction: '', hasComma: true });
    assert.deepEqual(displayParts('1234567,5'), { whole: '1.234.567', fraction: '5', hasComma: true });
  });
});
