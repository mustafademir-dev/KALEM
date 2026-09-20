/**
 * Gün Sonu Raporu (CSV) indirme.
 *
 * Sunucu `GET /merchants/:id/reports/daily` ile UTF-8 BOM'lu, `;` ayraçlı, "SİMÜLASYON"
 * damgalı bir CSV üretir. Bu dosya onu esnafın cihazına ulaştırır:
 *
 * - Web: Blob olarak indirilir (BOM baytları korunur; Excel Türkçe karakterleri doğru açar).
 * - iOS/Android: dosya sistemi/paylaşım paketi eklemeden (yeni bağımlılık yok), sistem
 *   paylaşım sayfası CSV METNİ ile açılır — muhasebeciye e-posta/mesajla gönderilebilir.
 *   (Native yol henüz gerçek cihazda DOĞRULANMADI.)
 */

import { Platform, Share } from 'react-native';
import { ORCHESTRATOR_BASE_URL } from '../utils/constants.js';
import { ApiError } from './api.service.js';

/**
 * @param {object} params
 * @param {string} params.merchantId
 * @param {string} params.apiKey
 * @param {string} params.date - YYYY-MM-DD (Türkiye saati).
 * @returns {Promise<{filename: string, method: 'download'|'share'}>}
 */
export async function downloadDailyReport({ merchantId, apiKey, date }) {
  const filename = `kalem-gun-sonu-SIMULASYON-${date}.csv`;

  let response;
  try {
    response = await fetch(
      `${ORCHESTRATOR_BASE_URL}/api/v1/merchants/${merchantId}/reports/daily?date=${encodeURIComponent(date)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
  } catch {
    throw new ApiError('Sunucuya ulaşılamadı — internet bağlantınızı kontrol edin.', { code: 'NETWORK_ERROR' });
  }

  if (!response.ok) {
    let message = 'Gün sonu raporu alınamadı.';
    try {
      message = (await response.json())?.message ?? message;
    } catch {
      // gövde JSON değil — varsayılan mesaj
    }
    throw new ApiError(message, { status: response.status });
  }

  if (Platform.OS === 'web') {
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { filename, method: 'download' };
  }

  const text = await response.text();
  await Share.share({ title: filename, message: text });
  return { filename, method: 'share' };
}
