/**
 * Üye İşyeri (Merchant) Route'ları
 *
 * POST /api/v1/merchants/register — Üye işyeri kaydı
 * GET  /api/v1/merchants/:id/balance — Havuz 1 dTL bakiye sorgulama
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import Merchant from '../../models/Merchant.model.js';
import config from '../../config/index.js';
import { generateApiKey, hashApiKey } from '../../utils/crypto.js';
import { readContractBalance } from '../../services/stellar-tx.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateMerchantRegister } from '../middleware/validation.middleware.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * POST /register
 *
 * Yeni üye işyeri kaydı oluşturur (KYC/KYB durumu 'pending' ile başlar,
 * doğrulama Faz 3'te ayrı bir işlemdir). Üretilen API anahtarı yalnızca
 * bu yanıtta bir kez gösterilir — sunucu yalnızca SHA-256 hash'ini saklar.
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
export async function registerMerchant(req, res) {
  try {
    const { businessName, taxId, stellarAddress, email, phone } = req.body;

    const existing = await Merchant.findOne({ $or: [{ taxId }, { stellarAddress }] });
    if (existing) {
      return res.status(409).json({
        error: 'ALREADY_REGISTERED',
        message: 'Bu vergi kimlik numarası veya Stellar adresi zaten kayıtlı.',
      });
    }

    const apiKey = generateApiKey();
    const merchant = await Merchant.create({
      businessName,
      taxId,
      stellarAddress,
      email,
      phone,
      apiKeyHash: hashApiKey(apiKey),
    });

    logger.info(`[Merchant] Yeni üye işyeri kaydedildi: ${merchant._id} (${businessName})`);

    res.status(201).json({
      merchantId: merchant._id.toString(),
      businessName: merchant.businessName,
      kycStatus: merchant.kycStatus,
      apiKey,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'ALREADY_REGISTERED',
        message: 'Bu vergi kimlik numarası veya Stellar adresi zaten kayıtlı.',
      });
    }
    logger.error(`[Merchant] registerMerchant hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Üye işyeri kaydı oluşturulamadı.' });
  }
}

/**
 * GET /:id/balance
 *
 * İşyerinin Havuz 1'deki dTL bakiyesini sorgular (Soroban RPC üzerinden
 * dtl-token.balance()). Kimlik doğrulaması zorunludur ve yalnızca işyeri
 * kendi bakiyesini sorgulayabilir.
 */
export async function getMerchantBalance(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz üye işyeri id.' });
    }
    if (req.merchantId !== id) {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Yalnızca kendi bakiyenizi sorgulayabilirsiniz.' });
    }

    const merchant = await Merchant.findById(id);
    if (!merchant) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Üye işyeri bulunamadı.' });
    }

    const balance = await readContractBalance(config.contracts.dtlTokenId, merchant.stellarAddress);

    res.status(200).json({
      merchantId: merchant._id.toString(),
      stellarAddress: merchant.stellarAddress,
      balance,
      currency: 'dTL',
    });
  } catch (error) {
    logger.error(`[Merchant] getMerchantBalance hatası: ${error.message}`);
    res.status(502).json({ error: 'BALANCE_QUERY_FAILED', message: 'Bakiye Soroban ağından okunamadı.' });
  }
}

router.post('/register', validateMerchantRegister, registerMerchant);
router.get('/:id/balance', authMiddleware, getMerchantBalance);

export default router;
