/**
 * Bildirim Servisi
 *
 * İşlem sonucu istemciye anlık bildirim gönderir.
 * SSE listener'dan tetiklenir.
 */

import logger from '../utils/logger.js';

/**
 * İşlem onaylandığında istemciye bildirim gönderir.
 *
 * @param {object} params
 * @param {string} params.merchantId - Üye işyeri ID.
 * @param {string} params.txHash - Stellar tx hash.
 * @param {string} params.status - İşlem durumu ('confirmed' veya 'failed').
 * @param {object} [params.distribution] - Havuz dağılım detayları.
 */
export async function notifyClient({ merchantId, txHash, status, distribution }) {
  // TODO: Faz 3'te implemente edilecek.
  // - WebSocket veya push notification altyapısı
  // - İstemci bağlantı yönetimi
  logger.warn('[Notification] notifyClient() henüz implemente edilmedi.');
}
