/**
 * KDV yardımcıları (istemci). Hesap, sunucudaki `orchestrator/src/utils/vat.js` ve
 * `money.js#kurusExcludingVat` ile AYNI: matrah = toplam × 100 / (100 + oran),
 * kuruşa yarım-yukarı yuvarlı. Ekranda gösterilen matrah/KDV fişle birebir tutar.
 */

const STROOPS_PER_KURUS = 100000n;

/** Esnafın departmanı yüklenemezse kullanılacak liste (sunucudaki varsayılanla aynı). */
export const DEFAULT_DEPARTMENTS = Object.freeze([
  { name: 'Genel', vatRate: 20 },
  { name: 'Gıda', vatRate: 10 },
  { name: 'Temel Gıda', vatRate: 1 },
]);

/**
 * KDV dahil tutarın matrah/KDV dökümü (kuruş).
 *
 * @param {string|null} totalStroops
 * @param {number} rate - 1, 10 veya 20.
 * @returns {{exclKurus: bigint, vatKurus: bigint} | null}
 */
export function vatSplit(totalStroops, rate) {
  if (!totalStroops) return null;
  const total = BigInt(totalStroops);
  const kurus = (total + STROOPS_PER_KURUS / 2n) / STROOPS_PER_KURUS;
  const d = BigInt(100 + rate);
  const exclKurus = (kurus * 200n + d) / (2n * d);
  return { exclKurus, vatKurus: kurus - exclKurus };
}

/** Kuruş → "1.234,50" (TL biçimi, iki ondalık). */
export function kurusToTl(kurus) {
  const k = typeof kurus === 'bigint' ? kurus : BigInt(kurus);
  const whole = (k / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${whole},${(k % 100n).toString().padStart(2, '0')}`;
}

/**
 * Fişteki KDV satırları. Yeni belgelerde `TaxSubtotal` dizidir (oran başına),
 * eski belgelerde tek nesne (%20). Her biri `{ percent, amount }`.
 */
export function vatLines(invoice) {
  const raw = invoice?.TaxTotal?.TaxSubtotal;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (list.length === 0) return [{ percent: 20, amount: invoice?.TaxTotal?.TaxAmount }];
  return list.map((t) => ({ percent: Number(t.Percent ?? 20), amount: t.TaxAmount }));
}
