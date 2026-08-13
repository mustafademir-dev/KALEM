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
 * Unique index üzerinden atomik bir kilit sağlar: aynı key ile eşzamanlı
 * gelen ikinci bir istek MongoDB'den E11000 (duplicate key) hatası alır —
 * yarış durumu (race condition) uygulama kodunda değil, veritabanı
 * seviyesinde engellenir.
 *
 * @param {string} key - İstemciden gelen UUID v4.
 * @returns {Promise<{isNew: boolean, existing?: object}>}
 *   - isNew: true → yeni (veya yeniden denenebilir) key, işleme devam edilebilir
 *   - isNew: false → mevcut key hâlâ geçerli, existing döner
 */
export async function acquireIdempotencyLock(key) {
  try {
    // DİKKAT: Model.create(doc, options) tekil obje verildiğinde options'ı
    // İKİNCİ bir doküman sanar (Mongoose'un variadic create() davranışı) —
    // bu da 'key alanı zorunlu' validasyon hatasına yol açar VE İLK
    // dokümanın sessizce yazılmasına rağmen çağrının başarısız görünmesine
    // neden olur (kilit sonsuza dek 'processing'de asılı kalabilir).
    // writeConcern'ün doğru uygulanması için docs MUTLAKA dizi olmalıdır.
    await IdempotencyKey.create([{ key, status: 'processing' }], { writeConcern: { w: 'majority' } });
    return { isNew: true };
  } catch (err) {
    if (err.code !== 11000) {
      logger.error(`[Idempotency] acquireIdempotencyLock hatası (${key}): ${err.message}`);
      throw err;
    }

    // Duplicate key: aynı UUID daha önce görülmüş.
    const existing = await IdempotencyKey.findOne({ key }, null, {
      readConcern: { level: 'linearizable' },
    });

    // Önceki deneme başarısız olduysa ('failed'), yeniden denemeye izin ver.
    // Koşullu güncelleme (status: 'failed' filtresiyle) eşzamanlı iki yeniden
    // deneme yarışırsa yalnızca birinin kazanmasını garanti eder.
    if (existing && existing.status === 'failed') {
      const retried = await IdempotencyKey.findOneAndUpdate(
        { key, status: 'failed' },
        { $set: { status: 'processing' }, $unset: { result: '', errorMessage: '' } },
        { new: true }
      );
      if (retried) {
        return { isNew: true };
      }
      // Başka bir istek aynı anda kilidi aldı; onun güncel durumunu oku.
      const refreshed = await IdempotencyKey.findOne({ key }, null, {
        readConcern: { level: 'linearizable' },
      });
      return { isNew: false, existing: refreshed };
    }

    return { isNew: false, existing };
  }
}

/**
 * İşlem tamamlandığında idempotency key'in durumunu günceller.
 *
 * @param {string} key - İşleme ait UUID.
 * @param {'completed'|'failed'} status - Sonuç durumu.
 * @param {object} [result] - İşlem sonucu (tx hash, transactionId vb.) — 'completed' replay'lerinde aynen döndürülür.
 */
export async function finalizeIdempotencyKey(key, status, result) {
  try {
    const update = { status };
    if (result !== undefined) {
      update.result = result;
    }
    if (result && result.transactionId) {
      update.transactionId = result.transactionId;
    }

    await IdempotencyKey.updateOne({ key }, { $set: update }, { writeConcern: { w: 'majority' } });
  } catch (error) {
    logger.error(`[Idempotency] finalizeIdempotencyKey hatası (${key}): ${error.message}`);
    throw error;
  }
}
