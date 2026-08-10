/**
 * Idempotency Middleware
 *
 * İstemciden gelen Idempotency-Key header'ını kontrol eder.
 * Bölüm 5.6.3'te tanımlanan mükerrer çekim koruması:
 * - writeConcern: majority
 * - readConcern: linearizable
 *
 * Yalnızca /transactions/submit endpoint'inde kullanılır.
 */

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function idempotencyMiddleware(req, res, next) {
  // TODO: Faz 2 Aşama 2.5'te implemente edilecek.
  //
  // 1. Idempotency-Key header'ını oku
  //    → yoksa 400 döndür
  //    → UUID v4 formatında değilse 400 döndür
  //
  // 2. IdempotencyKey.findOne({ key }, null, {
  //      readConcern: { level: 'linearizable' }
  //    })
  //    → bulunursa:
  //      - status === 'completed' → önceki sonucu 200 ile döndür
  //      - status === 'processing' → 409 Conflict döndür
  //      - status === 'failed' → yeniden işlemeye izin ver
  //
  // 3. Yeni key oluştur: IdempotencyKey.create(
  //      { key, status: 'processing' },
  //      { writeConcern: { w: 'majority' } }
  //    )
  //    → duplicate key hatası → 409 Conflict (race condition koruması)
  //
  // 4. req.idempotencyKey = key → next()

  next();
}
