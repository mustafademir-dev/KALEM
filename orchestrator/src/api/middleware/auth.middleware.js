/**
 * Kimlik Doğrulama Middleware
 *
 * İstemciden gelen isteklerin yetkili bir üye işyerinden geldiğini,
 * `Authorization: Bearer <apiKey>` başlığı ile doğrular. API anahtarı
 * yalnızca SHA-256 hash'i üzerinden karşılaştırılır — plaintext anahtar
 * veritabanında hiçbir yerde saklanmaz (bkz. utils/crypto.js, Merchant.model.js).
 */

import Merchant from '../../models/Merchant.model.js';
import { hashApiKey } from '../../utils/crypto.js';
import logger from '../../utils/logger.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function authMiddleware(req, res, next) {
  try {
    const header = req.get('Authorization') || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authorization: Bearer <apiKey> başlığı zorunludur.',
      });
    }

    const apiKeyHash = hashApiKey(token);
    const merchant = await Merchant.findOne({ apiKeyHash }).select('+apiKeyHash');

    if (!merchant) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Geçersiz API anahtarı.' });
    }
    if (!merchant.isActive) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Üye işyeri hesabı aktif değil.' });
    }

    req.merchant = merchant;
    req.merchantId = merchant._id.toString();
    next();
  } catch (error) {
    logger.error(`[Auth] authMiddleware hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Kimlik doğrulama sırasında hata oluştu.' });
  }
}
