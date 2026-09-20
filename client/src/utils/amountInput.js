/**
 * Tutar giriş klavyesinin durum makinesi — RN bağımlılığı yok (saf fonksiyonlar).
 *
 * Metin, kullanıcının yazdığı haldir: "", "0", "12", "12,", "12,5", "12,50".
 * Ondalık ayracı virgüldür (Türkçe); en fazla 2 ondalık (kuruş) ve en fazla 9 tam
 * basamak kabul edilir. Sonuç stroop'a `toStroops` ile çevrilir (1 dTL = 1 TL).
 */

import { dtlToStroops } from './format.js';

export const MAX_WHOLE_DIGITS = 9;
export const MAX_DECIMALS = 2;

/**
 * @param {string} current
 * @param {string} key - '0'..'9', ',', 'back' veya 'clear'
 * @returns {string}
 */
export function pressKey(current, key) {
  if (key === 'clear') return '';
  if (key === 'back') return current.slice(0, -1);

  if (key === ',') {
    if (current.includes(',')) return current;
    return current === '' ? '0,' : `${current},`;
  }

  if (!/^[0-9]$/.test(key)) return current;

  const [whole, fraction] = current.split(',');
  if (current.includes(',')) {
    return fraction.length >= MAX_DECIMALS ? current : current + key;
  }
  if (whole === '0') return key === '0' ? '0' : key; // baştaki sıfırları biriktirme
  if (whole.length >= MAX_WHOLE_DIGITS) return current;
  return current + key;
}

/** Yazılan metin → stroop string'i; boş/sıfır ise null. */
export function toStroops(text) {
  if (!/^\d+(,\d{0,2})?$/.test(text)) return null;
  const stroops = dtlToStroops(text.replace(',', '.').replace(/\.$/, ''));
  return BigInt(stroops) > 0n ? stroops : null;
}

/**
 * Ekranda göstermek için parçalar. `fraction`, kullanıcının yazdığı hâliyle döner
 * ("12," → fraction ""; "12,5" → "5"); `hasComma` virgülün gösterilip gösterilmeyeceğini söyler.
 */
export function displayParts(text) {
  const [wholeRaw = '', fraction = ''] = text.split(',');
  const whole = (wholeRaw === '' ? '0' : wholeRaw).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return { whole, fraction, hasComma: text.includes(',') };
}
