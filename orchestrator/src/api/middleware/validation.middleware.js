/**
 * Girdi Doğrulama Middleware
 *
 * İstemciden gelen request body'lerinin beklenen formatta
 * olduğunu doğrular. XDR formatı, tutar değerleri vb.
 */

import mongoose from 'mongoose';
import * as StellarSdk from '@stellar/stellar-sdk';
import stellarConfig from '../../config/stellar.js';

/**
 * İşlem gönderim request'inin doğrulaması.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateTransactionSubmit(req, res, next) {
  const { signedXdr, merchantId, totalAmount, cartItems } = req.body || {};

  if (!signedXdr || typeof signedXdr !== 'string') {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'signedXdr zorunludur ve string olmalıdır.' });
  }
  try {
    StellarSdk.TransactionBuilder.fromXDR(signedXdr, stellarConfig.networkPassphrase);
  } catch {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'signedXdr geçerli bir XDR/Base64 zarfı değil.' });
  }

  if (!merchantId || !mongoose.isValidObjectId(merchantId)) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'merchantId geçerli bir ObjectId olmalıdır.' });
  }

  if (typeof totalAmount !== 'string' || !/^[0-9]+$/.test(totalAmount) || BigInt(totalAmount) <= 0n) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'totalAmount pozitif bir tamsayı string olmalıdır (stroops).',
    });
  }

  if (cartItems !== undefined && !Array.isArray(cartItems)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'cartItems bir dizi olmalıdır.' });
  }

  next();
}

/**
 * Üye işyeri kayıt request'inin doğrulaması.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateMerchantRegister(req, res, next) {
  const { businessName, taxId, stellarAddress, email, phone } = req.body || {};

  if (!businessName || typeof businessName !== 'string' || !businessName.trim()) {
    return res
      .status(400)
      .json({ error: 'VALIDATION_ERROR', message: 'businessName zorunlu bir string olmalıdır.' });
  }

  if (!taxId || typeof taxId !== 'string' || !taxId.trim()) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'taxId zorunlu bir string olmalıdır.' });
  }

  if (!stellarAddress || typeof stellarAddress !== 'string' || !StellarSdk.StrKey.isValidEd25519PublicKey(stellarAddress)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'stellarAddress geçerli bir Stellar hesap adresi (G...) olmalıdır.',
    });
  }

  if (email !== undefined && email !== null && typeof email !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'email string olmalıdır.' });
  }

  if (phone !== undefined && phone !== null && typeof phone !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'phone string olmalıdır.' });
  }

  next();
}
