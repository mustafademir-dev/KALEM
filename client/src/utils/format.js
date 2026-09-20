/**
 * Biçimlendirme Yardımcıları
 *
 * dTL, Stellar'ın stroop biriminde tutulur: 1 dTL = 10.000.000 stroop
 * (7 ondalık basamak) — orchestrator/contracts ile aynı birim.
 */

const STROOPS_PER_DTL = 10_000_000n;

/** Stroop (string|bigint|number) → "1.2500000" biçiminde dTL string'i. */
export function stroopsToDtl(stroops) {
  const n = typeof stroops === 'bigint' ? stroops : BigInt(stroops ?? 0);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = abs / STROOPS_PER_DTL;
  const frac = abs % STROOPS_PER_DTL;
  return `${negative ? '-' : ''}${whole.toString()}.${frac.toString().padStart(7, '0')}`;
}

/** "1.25" veya "1" biçimindeki dTL string'ini stroop string'ine çevirir. */
export function dtlToStroops(dtlAmount) {
  const [wholePart, fracPart = ''] = String(dtlAmount).trim().split('.');
  const fracPadded = (fracPart + '0000000').slice(0, 7);
  const stroops = BigInt(wholePart || '0') * STROOPS_PER_DTL + BigInt(fracPadded || '0');
  return stroops.toString();
}

/** "1234567" → "1.234.567" (Türkçe binlik ayracı). */
function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Stroop → kullanıcıya gösterilecek TL parçaları (ürün kararı: 1 dTL = 1 TL).
 *
 * - Tam sayılar ondalıksız: 1 → "1"
 * - Kesirliler en az 2 haneli: 1,5 → "1,50"
 * - 2 haneden fazla ANLAMLI basamak varsa korunur (en fazla 7): 0,005 → "0,005".
 *   Ödeme 7 hane hassasiyetinde işlendiği için gösterimde sessizce yuvarlamak yanıltırdı.
 * - Binlik ayracı nokta, ondalık ayracı virgül: "1.250,75"
 *
 * @param {string|bigint|number} stroops
 * @returns {{negative: boolean, whole: string, fraction: string|null}}
 */
export function tlParts(stroops) {
  const n = typeof stroops === 'bigint' ? stroops : BigInt(stroops ?? 0);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const whole = groupThousands((abs / STROOPS_PER_DTL).toString());
  let fraction = (abs % STROOPS_PER_DTL).toString().padStart(7, '0').replace(/0+$/, '');
  if (fraction.length === 0) fraction = null;
  else if (fraction.length < 2) fraction = fraction.padEnd(2, '0');
  return { negative, whole, fraction };
}

/**
 * Stroop → "5.00" (kuruşa yuvarlanmış, nokta ayraçlı) — sunucudaki GİB belgesinin
 * `totalAmountTL` biçimiyle aynıdır; bir fişin tutarının işlem tutarıyla tutup
 * tutmadığını karşılaştırmak için kullanılır.
 */
export function stroopsToFixed2(stroops) {
  const n = typeof stroops === 'bigint' ? stroops : BigInt(stroops ?? 0);
  const kurus = (n + 50000n) / 100000n;
  return `${kurus / 100n}.${(kurus % 100n).toString().padStart(2, '0')}`;
}

/** Stroop → "1.250,75 TL" gösterim string'i (bkz. `tlParts`). */
export function formatTl(stroops) {
  const { negative, whole, fraction } = tlParts(stroops);
  return `${negative ? '-' : ''}${whole}${fraction ? `,${fraction}` : ''} TL`;
}

/** "GDE47H...V67L3R3B" gibi kısaltılmış adres/hash gösterimi. */
export function shortenMiddle(value, head = 6, tail = 6) {
  if (!value || value.length <= head + tail + 3) return value ?? '';
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

const TX_EXPLORER_BASE = 'https://stellar.expert/explorer/testnet/tx/';

export function stellarExpertTxUrl(hash) {
  return `${TX_EXPLORER_BASE}${hash}`;
}
