/**
 * Idempotency Middleware
 *
 * İstemciden gelen Idempotency-Key header'ını kontrol eder ve gerçek kilit
 * mantığı için idempotency.service.js'i çağırır (mantık tek yerde —
 * bkz. acquireIdempotencyLock). Bu dosya yalnızca HTTP katmanıdır.
 *
 * Bölüm 5.6.3'te tanımlanan mükerrer çekim koruması:
 * - writeConcern: majority
 * - readConcern: linearizable
 *
 * Yalnızca /transactions/submit endpoint'inde kullanılır.
 */

import { validate as isUuid, version as uuidVersion } from 'uuid';
import { acquireIdempotencyLock } from '../../services/idempotency.service.js';
import logger from '../../utils/logger.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function idempotencyMiddleware(req, res, next) {
  try {
    const key = req.get('Idempotency-Key');

    if (!key || !isUuid(key) || uuidVersion(key) !== 4) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Idempotency-Key başlığı zorunludur ve UUID v4 formatında olmalıdır.',
      });
    }

    const { isNew, existing } = await acquireIdempotencyLock(key);

    if (!isNew) {
      if (existing?.status === 'completed') {
        // Aynı istek daha önce tamamlandı — ağa TEKRAR gitmeden saklanan sonucu döndür.
        return res.status(200).json(existing.result ?? {});
      }
      // status === 'processing' — uçuşta olan bir istekle çakışıyor.
      return res.status(409).json({
        error: 'CONFLICT',
        message: 'Bu Idempotency-Key ile bir istek zaten işleniyor.',
      });
    }

    req.idempotencyKey = key;
    // Canlı işlem akışı 2. adımının GERÇEK anı — işlem kaydı henüz yok,
    // olay handler'da Transaction oluşturulunca bu zamanla yazılır.
    req.idempotencyLockedAt = new Date();
    next();
  } catch (error) {
    logger.error(`[Idempotency] idempotencyMiddleware hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Idempotency kontrolü sırasında hata oluştu.' });
  }
}
