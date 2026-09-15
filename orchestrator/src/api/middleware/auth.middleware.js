/**
 * Kimlik Doğrulama Middleware
 *
 * İstemciden gelen isteklerin yetkili bir üye işyerinden geldiğini,
 * `Authorization: Bearer <apiKey>` başlığı ile doğrular. API anahtarı
 * yalnızca SHA-256 hash'i üzerinden karşılaştırılır — plaintext anahtar
 * veritabanında hiçbir yerde saklanmaz (bkz. utils/crypto.js, Merchant.model.js).
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import Merchant from '../../models/Merchant.model.js';
import { hashApiKey } from '../../utils/crypto.js';
import { verifySignedBySource } from '../../services/fee-bump.service.js';
import stellarConfig from '../../config/stellar.js';
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

/**
 * `POST /transactions/submit` için iki yollu kimlik doğrulama.
 *
 * v2 — Müşteri→Esnaf Ödeme: bu uca artık YALNIZCA esnaflar değil, `pay_merchant`
 * işlemini kendi Ed25519 anahtarıyla imzalamış müşteriler de doğrudan
 * çağrı yapabilir. İki geçerli yol vardır:
 *
 * 1. `Authorization: Bearer <apiKey>` başlığı VARSA → mevcut esnaf yolu
 *    (`authMiddleware`'e aynen devredilir, davranış değişmez).
 * 2. YOKSA → müşteri yolu: `req.body.signedXdr` parse edilir ve
 *    `verifySignedBySource()` ile o zarfın gerçekten kendi `source`
 *    hesabı tarafından imzalandığı doğrulanır (merchant kaydındaki
 *    `buildMerchantOwnershipChallenge` + `Keypair.verify()` deseniyle
 *    AYNI kriptografik ilke — burada ayrı bir challenge mesajına gerek
 *    yok, çünkü müşterinin zaten imzaladığı işlem zarfı bu kanıtı taşıyor).
 *    Başarılıysa `req.senderAddress` set edilir, `req.merchantId` set
 *    EDİLMEZ (bu istek bir esnaf kimliği taşımıyor).
 *
 * Bu middleware, `validateTransactionSubmit`'ten SONRA çalışacak şekilde
 * route'a bağlanmalıdır (`signedXdr`'ın en azından bir string olduğu
 * zaten doğrulanmış olmalı).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function submitAuthMiddleware(req, res, next) {
  const header = req.get('Authorization') || '';
  if (header.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }

  try {
    const { signedXdr } = req.body || {};
    const innerTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, stellarConfig.networkPassphrase);

    if (innerTx instanceof StellarSdk.FeeBumpTransaction) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'signedXdr bir Fee-Bump zarfı olamaz.' });
    }
    if (!verifySignedBySource(innerTx)) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'signedXdr, kendi kaynak hesabı tarafından imzalanmamış — ne esnaf API anahtarı ne de geçerli bir müşteri imzası bulundu.',
      });
    }

    req.senderAddress = innerTx.source;
    // Canlı işlem akışı 1. adımının GERÇEK anı (bkz. transaction.routes.js).
    req.signatureVerifiedAt = new Date();
    next();
  } catch (error) {
    logger.error(`[Auth] submitAuthMiddleware hatası: ${error.message}`);
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'signedXdr ayrıştırılamadı.' });
  }
}
