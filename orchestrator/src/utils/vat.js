/**
 * KDV hesabı — GİB belgesi ve gün sonu raporu AYNI fonksiyonu kullanır, böylece
 * iki taraf kuruşu kuruşuna aynı rakamı üretir.
 *
 * Oran, sepet kaleminin `vatRate`'inden gelir (esnafın seçtiği departman). Oran yoksa
 * ya da sepet toplamla tutmuyorsa eski davranış: tek grup, %20.
 */

import { stroopsToKurus, kurusExcludingVat } from './money.js';
import { cartMatchesTotal } from './cart-items.js';

/** Türkiye'de geçerli KDV oranları. */
export const ALLOWED_VAT_RATES = Object.freeze([1, 10, 20]);
export const DEFAULT_VAT_RATE = 20;

export function isAllowedVatRate(rate) {
  return ALLOWED_VAT_RATES.includes(rate);
}

/**
 * Esnafa izin verilmeyen oranı izin verilen bir orana çeker (yazar kasalardaki
 * "faaliyet koduna göre KDV sınırlaması" mantığı). Tercih: %20, yoksa ilk izinli oran.
 */
export function clampToAllowed(rate, allowedRates) {
  const allowed = Array.isArray(allowedRates) && allowedRates.length > 0 ? allowedRates : ALLOWED_VAT_RATES;
  if (allowed.includes(rate)) return rate;
  return allowed.includes(DEFAULT_VAT_RATE) ? DEFAULT_VAT_RATE : allowed[0];
}

/**
 * Toplam tutarın KDV dökümü.
 *
 * @param {string} totalStroops
 * @param {Array<{quantity: number, price: string, vatRate?: number}>} [cartItems]
 * @returns {{useCart: boolean, totalKurus: bigint, exclKurus: bigint, vatKurus: bigint,
 *   groups: Array<{rate: number, inclKurus: bigint, exclKurus: bigint}>}}
 *   `groups` orana göre artan sıradadır; Σ inclKurus == totalKurus.
 */
export function vatBreakdown(totalStroops, cartItems = []) {
  const totalKurus = stroopsToKurus(totalStroops);
  const useCart = cartMatchesTotal(cartItems, String(totalStroops));

  const stroopsByRate = new Map();
  if (useCart) {
    for (const item of cartItems) {
      const rate = isAllowedVatRate(item.vatRate) ? item.vatRate : DEFAULT_VAT_RATE;
      stroopsByRate.set(rate, (stroopsByRate.get(rate) ?? 0n) + BigInt(item.price) * BigInt(item.quantity));
    }
  } else {
    stroopsByRate.set(DEFAULT_VAT_RATE, BigInt(totalStroops));
  }

  const groups = [...stroopsByRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, stroops]) => ({ rate, inclKurus: stroopsToKurus(stroops) }));
  // Grup başına kuruşa yuvarlama farkını en büyük gruba yükle: Σ grup == toplam.
  const drift = totalKurus - groups.reduce((a, g) => a + g.inclKurus, 0n);
  if (drift !== 0n) {
    const biggest = groups.reduce((a, g) => (g.inclKurus > a.inclKurus ? g : a), groups[0]);
    biggest.inclKurus += drift;
  }
  for (const g of groups) g.exclKurus = kurusExcludingVat(g.inclKurus, g.rate);

  const exclKurus = groups.reduce((a, g) => a + g.exclKurus, 0n);
  return { useCart, totalKurus, exclKurus, vatKurus: totalKurus - exclKurus, groups };
}
