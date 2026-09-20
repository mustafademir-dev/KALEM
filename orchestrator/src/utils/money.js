/**
 * Para birimi yardımcıları.
 *
 * Zincirde tutarlar stroop cinsindendir: 1 dTL = 10.000.000 stroop (7 ondalık).
 * Ürün kararı: 1 dTL = 1 TL — kullanıcıya TL olarak gösterilir. Bu yüzden
 * stroop → TL dönüşümü BURADA, tek yerde yapılır (BigInt — kayan nokta yok).
 *
 * TL'nin en küçük birimi kuruştur (1 kuruş = 100.000 stroop). GİB/ÖKC belgeleri
 * kuruşa yuvarlanmış (2 ondalık) tutar taşır; ekranlarda ve raporlarda ise
 * anlamlı olan tüm basamaklar (7'ye kadar) korunur, böylece %0,1'lik bir
 * komisyon (örn. 0,005 TL) sessizce yuvarlanıp yanlış gösterilmez.
 */

const STROOPS_PER_TL = 10_000_000n;
const STROOPS_PER_KURUS = 100_000n;
const STROOP_RE = /^\d{1,30}$/;

/** `value` geçerli bir stroop tutarı mı (negatif olmayan tamsayı string'i)? */
export function isStroops(value) {
  return typeof value === 'string' && STROOP_RE.test(value);
}

function toBigInt(stroops) {
  if (typeof stroops === 'bigint') return stroops;
  if (isStroops(String(stroops ?? ''))) return BigInt(stroops);
  return 0n;
}

/** Stroop → kuruş (BigInt), yarımlar yukarı yuvarlanır. */
export function stroopsToKurus(stroops) {
  const n = toBigInt(stroops);
  return (n + STROOPS_PER_KURUS / 2n) / STROOPS_PER_KURUS;
}

/** Kuruş (BigInt) → "12.35" — tam 2 ondalık, nokta ayraçlı (GİB/UBL biçimi). */
export function kurusToFixed2(kurus) {
  const k = typeof kurus === 'bigint' ? kurus : BigInt(kurus);
  const whole = k / 100n;
  const frac = (k % 100n).toString().padStart(2, '0');
  return `${whole}.${frac}`;
}

/**
 * KDV DAHİL tutardan (kuruş) KDV HARİÇ matrahı (kuruş) çıkarır: matrah = toplam / 1,20,
 * kuruşa yuvarlanmış. KDV oranı simülasyonda sabit %20'dir. GİB belgesi ve gün sonu
 * raporu AYNI hesabı kullanır — böylece rakamlar birbirini tutar.
 */
export function kurusExcludingVat(kurus) {
  return (kurus * 5n + 3n) / 6n;
}

/** Stroop → "12.35" (kuruşa yuvarlanmış, tam 2 ondalık). GİB belgeleri için. */
export function stroopsToFixed2(stroops) {
  return kurusToFixed2(stroopsToKurus(stroops));
}

/**
 * Stroop → TL string'i; anlamlı olan tüm ondalıklar (en fazla 7) korunur,
 * sondaki sıfırlar atılır. `minDecimals` en az bu kadar ondalık gösterir.
 *
 * @param {string|bigint} stroops
 * @param {object} [opts]
 * @param {number} [opts.minDecimals=0]
 * @param {',' | '.'} [opts.decimalSeparator='.']
 * @returns {string} Örn. "1", "1.5", "0.005", (minDecimals=2) "1.00".
 */
export function stroopsToTl(stroops, { minDecimals = 0, decimalSeparator = '.' } = {}) {
  const n = toBigInt(stroops);
  const whole = n / STROOPS_PER_TL;
  let frac = (n % STROOPS_PER_TL).toString().padStart(7, '0').replace(/0+$/, '');
  while (frac.length < minDecimals) frac += '0';
  return frac ? `${whole}${decimalSeparator}${frac}` : `${whole}`;
}
