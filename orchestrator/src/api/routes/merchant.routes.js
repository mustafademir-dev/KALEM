/**
 * Üye İşyeri (Merchant) Route'ları
 *
 * POST /api/v1/merchants/register — Üye işyeri kaydı
 * GET  /api/v1/merchants/:id/balance — Havuz 1 dTL bakiye sorgulama
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import * as StellarSdk from '@stellar/stellar-sdk';
import Merchant from '../../models/Merchant.model.js';
import config from '../../config/index.js';
import { generateApiKey, hashApiKey, buildMerchantOwnershipChallenge } from '../../utils/crypto.js';
import { readContractBalance } from '../../services/stellar-tx.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateMerchantRegister } from '../middleware/validation.middleware.js';
import logger from '../../utils/logger.js';
import { merchantRegisterRateLimiter, accountAuthRateLimiter } from '../middleware/rate-limit.middleware.js';
import {
  hashSecret,
  verifySecret,
  lockedMinutesLeft,
  registerFailedLogin,
} from '../../utils/credentials.js';

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
 *   "signature": "<base64 Ed25519 imzası>",
 *   "email": "...",
 *   "phone": "..."
 * }
 *
 * `signature`, istemcinin `stellarAddress`'e ait ÖZEL ANAHTARIYLA
 * `buildMerchantOwnershipChallenge(taxId, stellarAddress)` mesajını imzalayarak
 * ürettiği kanıttır (v2 — Müşteri→Esnaf Ödeme). Bu, kaydın gerçekten o
 * adresin sahibi tarafından yapıldığını garanti eder. Bu adım, esnafı
 * on-chain KAYDETMEZ — yalnızca `ownershipVerified:true` işaretler;
 * on-chain `register_merchant()` çağrısı ayrı, admin onaylı bir CLI
 * script iledir (bkz. `scripts/approve-merchant.mjs`).
 */
export async function registerMerchant(req, res) {
  try {
    const { businessName, taxId, stellarAddress, email, phone, signature, password } = req.body;

    const existing = await Merchant.findOne({ $or: [{ taxId }, { stellarAddress }] });
    if (existing) {
      return res.status(409).json({
        error: 'ALREADY_REGISTERED',
        message: 'Bu vergi kimlik numarası veya Stellar adresi zaten kayıtlı.',
      });
    }

    // v2: adres sahipliği kanıtı — imza gerçekten stellarAddress'e mi ait?
    const challenge = buildMerchantOwnershipChallenge(taxId, stellarAddress);
    let ownershipVerified = false;
    try {
      const keypair = StellarSdk.Keypair.fromPublicKey(stellarAddress);
      ownershipVerified = keypair.verify(Buffer.from(challenge, 'utf8'), Buffer.from(signature, 'base64'));
    } catch {
      ownershipVerified = false;
    }
    if (!ownershipVerified) {
      return res.status(403).json({
        error: 'OWNERSHIP_PROOF_FAILED',
        message: 'signature, stellarAddress sahipliğini kanıtlamıyor.',
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
      ...(password ? { passwordHash: hashSecret(password) } : {}),
      ownershipVerified: true,
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
      kycStatus: merchant.kycStatus,
      onChainRegistered: merchant.onChainRegistered,
    });
  } catch (error) {
    logger.error(`[Merchant] getMerchantBalance hatası: ${error.message}`);
    res.status(502).json({ error: 'BALANCE_QUERY_FAILED', message: 'Bakiye Soroban ağından okunamadı.' });
  }
}

router.post('/register', merchantRegisterRateLimiter, validateMerchantRegister, registerMerchant);

const MAX_SESSIONS = 10;
const WRONG_CREDENTIALS = 'Vergi numarası veya şifre hatalı.';

/**
 * POST /login  { "taxId": "...", "password": "..." }
 *
 * VKN + şifre ile giriş. Başarılıysa yeni bir oturum anahtarı üretilir (yalnızca
 * özeti saklanır) ve istemci onu `Authorization: Bearer` ile kullanır. Son 10
 * oturum geçerlidir — bilgisayar ve telefon aynı anda açık kalabilir.
 * 5 hatalı denemede hesap 15 dakika kilitlenir.
 */
export async function loginMerchant(req, res) {
  try {
    const { taxId, password } = req.body || {};
    if (typeof taxId !== 'string' || !taxId.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Vergi numarası ve şifre zorunludur.' });
    }
    const merchant = await Merchant.findOne({ taxId: taxId.trim() }).select('+passwordHash +sessionKeyHashes');
    if (!merchant || !merchant.passwordHash) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: WRONG_CREDENTIALS });
    }
    const minutes = lockedMinutesLeft(merchant);
    if (minutes > 0) {
      return res
        .status(423)
        .json({ error: 'LOCKED', message: `Çok fazla hatalı deneme. ${minutes} dakika sonra tekrar deneyin.` });
    }
    if (!verifySecret(password, merchant.passwordHash)) {
      await registerFailedLogin(merchant);
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: WRONG_CREDENTIALS });
    }
    if (!merchant.isActive) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Üye işyeri hesabı aktif değil.' });
    }

    const sessionKey = generateApiKey();
    merchant.sessionKeyHashes = [...(merchant.sessionKeyHashes ?? []), hashApiKey(sessionKey)].slice(-MAX_SESSIONS);
    merchant.failedLoginCount = 0;
    merchant.lockedUntil = null;
    await merchant.save();

    res.status(200).json({
      merchantId: merchant._id.toString(),
      apiKey: sessionKey,
      businessName: merchant.businessName,
      stellarAddress: merchant.stellarAddress,
      onChainRegistered: merchant.onChainRegistered,
      kycStatus: merchant.kycStatus,
    });
  } catch (error) {
    logger.error(`[Merchant] loginMerchant hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Giriş yapılamadı.' });
  }
}

router.post('/login', accountAuthRateLimiter, loginMerchant);
router.get('/:id/balance', authMiddleware, getMerchantBalance);

export default router;
