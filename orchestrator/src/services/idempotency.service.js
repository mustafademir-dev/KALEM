/**
 * Idempotency Servisi
 *
 * Bölüm 5.6.3: Mükerrer çekim korumasının iş mantığı.
 * MongoDB üzerinde unique index + writeConcern: majority +
 * readConcern: linearizable ile tasarlanmıştır.
 */

import IdempotencyKey from '../models/IdempotencyKey.model.js';
import logger from '../utils/logger.js';

/**
 * Yeni bir idempotency key'i kaydetmeye çalışır.
 *
 * @param {string} key - İstemciden gelen UUID v4.
 * @returns {Promise<{isNew: boolean, existingResult?: object}>}
 *   - isNew: true → yeni key, işleme devam edilebilir
 *   - isNew: false → mevcut key, existingResult döner
 */
export async function acquireIdempotencyLock(key) {
  // TODO: Faz 2 Aşama 2.5'te implemente edilecek.
  //
  // try {
  //   await IdempotencyKey.create(
  //     { key, status: 'processing' },
  //     { writeConcern: { w: 'majority' } }
  //   );
  //   return { isNew: true };
  // } catch (err) {
  //   if (err.code === 11000) { // duplicate key
  //     const existing = await IdempotencyKey.findOne(
  //       { key },
  //       null,
  //       { readConcern: { level: 'linearizable' } }
  //     );
  //     return { isNew: false, existingResult: existing };
  //   }
  //   throw err;
  // }

  logger.warn('[Idempotency] acquireIdempotencyLock() henüz implemente edilmedi.');
  return { isNew: true };
}

/**
 * İşlem tamamlandığında idempotency key'in durumunu günceller.
 *
 * @param {string} key - İşleme ait UUID.
 * @param {'completed'|'failed'} status - Sonuç durumu.
 * @param {object} [result] - İşlem sonucu (tx hash, vb.).
 */
export async function finalizeIdempotencyKey(key, status, result) {
  // TODO: Faz 2 Aşama 2.5'te implemente edilecek.
  logger.warn('[Idempotency] finalizeIdempotencyKey() henüz implemente edilmedi.');
}
