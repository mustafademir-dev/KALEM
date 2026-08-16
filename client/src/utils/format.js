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

/** Stroop → "1.2500000 dTL" gösterim string'i. */
export function formatDtl(stroops) {
  return `${stroopsToDtl(stroops)} dTL`;
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
