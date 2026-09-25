/**
 * İade ekranındaki fiş önerileri — `matchReceipts` (saf fonksiyon).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchReceipts } from '../src/utils/receiptSearch.js';

const item = (id, no, refunded = false) => ({ id, gibDocumentNo: no, refunded, totalAmount: '10000000' });
const ITEMS = [
  item('1', 'KALEM20260925991234'),
  item('2', 'KALEM20260925123499'),
  item('3', 'KALEM20260924555555', true),
  item('4', null),
  item('5', 'KALEM20260924990000'),
];

describe('matchReceipts', () => {
  it('yazılan rakamlar numaranın herhangi bir yerinde olabilir', () => {
    assert.deepEqual(matchReceipts(ITEMS, '99').map((r) => r.id), ['1', '2', '5']);
  });

  it('büyük/küçük harf ve baştaki/sondaki boşluk önemsiz', () => {
    assert.deepEqual(matchReceipts(ITEMS, '  kalem20260925 ').map((r) => r.id), ['1', '2']);
  });

  it('boş metinde belge numarası olan son fişler; iade edilenler en sonda', () => {
    assert.deepEqual(matchReceipts(ITEMS, '').map((r) => r.id), ['1', '2', '5', '3']);
  });

  it('en fazla 6 öneri döner', () => {
    const many = Array.from({ length: 10 }, (_, i) => item(String(i), `KALEM${i}`));
    assert.equal(matchReceipts(many, 'KALEM').length, 6);
  });

  it('eşleşme yoksa boş liste', () => {
    assert.deepEqual(matchReceipts(ITEMS, 'XYZ'), []);
  });
});
