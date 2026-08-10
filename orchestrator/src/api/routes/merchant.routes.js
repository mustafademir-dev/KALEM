/**
 * Üye İşyeri (Merchant) Route'ları
 *
 * POST /api/v1/merchants/register — Üye işyeri kaydı
 * GET  /api/v1/merchants/:id/balance — Havuz 1 dTL bakiye sorgulama
 */

import { Router } from 'express';

const router = Router();

/**
 * POST /register
 *
 * Yeni üye işyeri kaydı oluşturur (KYC/KYB stub).
 *
 * Request Body:
 * {
 *   "businessName": "...",
 *   "taxId": "...",
 *   "stellarAddress": "G...",
 *   "email": "...",
 *   "phone": "..."
 * }
 */
router.post('/register', async (req, res) => {
  // TODO: Faz 3 Aşama 3.3'te implemente edilecek.
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Üye işyeri kaydı henüz implemente edilmedi.',
  });
});

/**
 * GET /:id/balance
 *
 * İşyerinin Havuz 1'deki dTL bakiyesini sorgular.
 * Soroban RPC üzerinden dtl-token kontratının balance() fonksiyonunu çağırır.
 */
router.get('/:id/balance', async (req, res) => {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Bakiye sorgulama henüz implemente edilmedi.',
  });
});

export default router;
