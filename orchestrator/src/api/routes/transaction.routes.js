/**
 * İşlem (Transaction) Route'ları
 *
 * POST /api/v1/transactions/submit — İmzalı XDR paketini kabul eder
 * GET  /api/v1/transactions/:txHash — İşlem durumu sorgulama
 */

import { Router } from 'express';
// import { idempotencyMiddleware } from '../middleware/idempotency.middleware.js';

const router = Router();

/**
 * POST /submit
 *
 * İstemciden gelen imzalı XDR (Base64) paketini kabul eder.
 * Idempotency-Key header'ı zorunludur.
 *
 * Akış:
 * 1. idempotency.middleware → UUID kontrolü
 * 2. fee-bump.service → dış zarf sarmalama + Havuz 2 imzası
 * 3. Stellar Horizon'a iletim
 * 4. MongoDB'ye işlem kaydı oluştur (status: submitted)
 * 5. SSE listener onay gelince → status: confirmed + GİB tetikleme
 *
 * Request Body:
 * {
 *   "signedXdr": "AAAA...",       // İmzalı iç zarf (Base64/XDR)
 *   "merchantId": "...",          // Üye işyeri ID
 *   "totalAmount": "10000000",    // dTL tutarı (stroops)
 *   "cartItems": [...]            // Sepet detayı (GİB eşlemesi için)
 * }
 *
 * Headers:
 *   Idempotency-Key: <UUID v4>
 */
router.post('/submit', /* idempotencyMiddleware, */ async (req, res) => {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'İşlem gönderimi henüz implemente edilmedi.',
  });
});

/**
 * GET /:txHash
 *
 * Stellar transaction hash'ine göre işlem durumunu sorgular.
 */
router.get('/:txHash', async (req, res) => {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'İşlem sorgulama henüz implemente edilmedi.',
  });
});

export default router;
