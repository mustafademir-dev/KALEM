/**
 * Sepet kalemleri (QR'dan gelen `cartItems`) için temizleme ve bütünlük kontrolü.
 *
 * `cartItems` müşterinin okuttuğu QR'dan gelir ve `POST /transactions/submit`
 * gövdesinde taşınır — yani GÜVENİLMEYEN girdidir. Saklanıp GİB belgesine
 * yazılmadan önce burada sıkı biçimde temizlenir. Bu fonksiyonlar ASLA hata
 * fırlatmaz: geçersiz girdi boş listeye/reddedilmiş kaleme dönüşür, ödeme
 * yolunu hiçbir koşulda etkilemez.
 *
 * Kalem biçimi (QR şeması KALEM-PAY-V1): { name, quantity, price, vatRate? } —
 * `price` BİRİM fiyat, stroop, string; `vatRate` %1/%10/%20 (esnafın departmanı).
 * Geçersiz oran atılır (hesapta %20 varsayılır).
 */

import { isStroops } from './money.js';

const MAX_ITEMS = 50;
const MAX_NAME_LENGTH = 120;
const MAX_QUANTITY = 9999;

/**
 * @param {unknown} raw
 * @returns {Array<{name: string, quantity: number, price: string}>}
 */
export function sanitizeCartItems(raw) {
  if (!Array.isArray(raw)) return [];

  const items = [];
  for (const entry of raw.slice(0, MAX_ITEMS)) {
    if (!entry || typeof entry !== 'object') continue;
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    const quantity = entry.quantity === undefined ? 1 : entry.quantity;
    const price = entry.price;
    if (!name) continue;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) continue;
    if (!isStroops(price) || BigInt(price) <= 0n) continue;
    const item = { name, quantity, price };
    if ([1, 10, 20].includes(entry.vatRate)) item.vatRate = entry.vatRate;
    items.push(item);
  }
  return items;
}

/**
 * Kalemlerin toplamı (Σ birim fiyat × adet), ödenen toplam tutara TAM eşit mi?
 * Eşit değilse sepet fişe yansıtılmaz — fiş satırları ile toplam tutmayan bir
 * belge, hiç satır göstermemekten kötüdür.
 *
 * @param {Array<{quantity: number, price: string}>} items
 * @param {string} totalStroops
 * @returns {boolean}
 */
export function cartMatchesTotal(items, totalStroops) {
  if (!Array.isArray(items) || items.length === 0 || !isStroops(totalStroops)) return false;
  const sum = items.reduce((acc, item) => acc + BigInt(item.price) * BigInt(item.quantity), 0n);
  return sum === BigInt(totalStroops);
}
