/**
 * Tarih yardımcıları — RN bağımlılığı yok (saf fonksiyonlar).
 *
 * Günler Türkiye saatine göre hesaplanır. Türkiye 2016'dan beri kalıcı UTC+3'tedir
 * (yaz saati yok), bu yüzden sabit +3 saat farkı doğrudur. Sunucudaki gün sınırı
 * (`merchant-report.service.js`) ile AYNI kural — ekran ve rapor aynı günü görür.
 */

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function istanbulIso(dateLike) {
  return new Date(new Date(dateLike).getTime() + ISTANBUL_OFFSET_MS).toISOString();
}

/** Şu anın Türkiye saatine göre tarihi: "2026-09-19". */
export function istanbulToday(now = new Date()) {
  return istanbulIso(now).slice(0, 10);
}

/** "2026-09-19" + gün farkı → "2026-09-20". Aylık/yıllık taşmayı doğru yapar. */
export function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "2026-09-19" → "19 Eylül 2026". */
export function formatTrDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** ISO an → Türkiye saatinde "13:05". */
export function formatTrClock(iso) {
  return istanbulIso(iso).slice(11, 16);
}

/** ISO an → Türkiye saatinde "19 Eyl · 13:05". */
export function formatTrDateTime(iso) {
  const s = istanbulIso(iso);
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  return `${d} ${MONTHS_SHORT[m - 1]} · ${s.slice(11, 16)}`;
}
