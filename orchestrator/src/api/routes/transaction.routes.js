/**
 * İşlem (Transaction) Route'ları
 *
 * POST /api/v1/transactions/submit — İmzalı XDR paketini kabul eder
 * GET  /api/v1/transactions/:txHash — İşlem durumu sorgulama
 */

import { Router } from 'express';
import * as StellarSdk from '@stellar/stellar-sdk';
import stellarConfig from '../../config/stellar.js';
import Transaction from '../../models/Transaction.model.js';
import { wrapAndSubmitFeeBump } from '../../services/fee-bump.service.js';
import { finalizeIdempotencyKey } from '../../services/idempotency.service.js';
import { authMiddleware, submitAuthMiddleware } from '../middleware/auth.middleware.js';
import { validateTransactionSubmit } from '../middleware/validation.middleware.js';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware.js';
import logger from '../../utils/logger.js';

const router = Router();

/**
 * POST /submit
 *
 * İstemciden gelen imzalı XDR (Base64) paketini kabul eder.
 * Idempotency-Key header'ı zorunludur.
 *
 * Akış:
 * 1. validateTransactionSubmit → gövde doğrulaması
 * 2. submitAuthMiddleware → kimlik doğrulaması (esnaf Bearer API key YA DA
 *    müşterinin kendi imzasıyla imzaladığı signedXdr'ın kanıtı — bkz.
 *    auth.middleware.js'teki submitAuthMiddleware dokümantasyonu)
 * 3. idempotencyMiddleware → mükerrer istek koruması
 * 4. Bu handler → esnaf yolunda kendi kaydına erişim kontrolü, Transaction
 *    kaydı, fee-bump.service.wrapAndSubmitFeeBump() ile Stellar ağına
 *    iletim, idempotency kaydının sonuçla kapatılması
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
export async function submitTransactionHandler(req, res) {
  const { signedXdr, merchantId, totalAmount } = req.body;
  const idempotencyKey = req.idempotencyKey;

  // Esnaf yolu (Bearer API key ile geldi): yalnızca kendi işyeri adına gönderebilir.
  // Müşteri yolunda (req.merchantId set edilmemiş) bu kontrol atlanır — zincir
  // zaten pay_merchant içinde merchantId'nin karşılığı olan stellarAddress'in
  // kayıtlı esnaf olup olmadığını doğrular.
  if (req.merchantId && req.merchantId !== merchantId) {
    await finalizeIdempotencyKey(idempotencyKey, 'failed', { error: 'FORBIDDEN' }).catch((err) => {
      logger.error(`[Transaction] finalize (forbidden) hatası: ${err.message}`);
    });
    return res
      .status(403)
      .json({ error: 'FORBIDDEN', message: 'Yalnızca kendi işyeriniz adına işlem gönderebilirsiniz.' });
  }

  let senderAddress;
  try {
    const innerTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, stellarConfig.networkPassphrase);
    senderAddress = innerTx.source;
  } catch {
    await finalizeIdempotencyKey(idempotencyKey, 'failed', { error: 'VALIDATION_ERROR' }).catch((err) => {
      logger.error(`[Transaction] finalize (parse) hatası: ${err.message}`);
    });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'signedXdr ayrıştırılamadı.' });
  }

  let transaction;
  try {
    transaction = await Transaction.create({
      idempotencyKey,
      senderAddress,
      merchantId,
      totalAmount,
      status: 'pending',
    });

    const response = await wrapAndSubmitFeeBump(signedXdr);

    transaction.status = 'submitted';
    transaction.txHash = response.hash;
    await transaction.save();

    const result = {
      transactionId: transaction._id.toString(),
      status: 'submitted',
      message: 'İşlem Fee-Bump ile sarmalanarak Stellar ağına iletildi.',
    };

    await finalizeIdempotencyKey(idempotencyKey, 'completed', result);

    logger.info(`[Transaction] Gönderildi (id: ${transaction._id}, hash: ${response.hash})`);
    res.status(201).json(result);
  } catch (error) {
    logger.error(`[Transaction] submitTransactionHandler hatası: ${error.message}`);

    if (transaction) {
      transaction.status = 'failed';
      transaction.errorMessage = error.message;
      await transaction.save().catch((saveErr) => {
        logger.error(`[Transaction] Hata durumu kaydedilemedi: ${saveErr.message}`);
      });
    }

    await finalizeIdempotencyKey(idempotencyKey, 'failed', { error: error.message }).catch((finalizeErr) => {
      logger.error(`[Idempotency] finalize (failed) hatası: ${finalizeErr.message}`);
    });

    res.status(502).json({ error: 'SUBMIT_FAILED', message: 'İşlem Stellar ağına iletilemedi.' });
  }
}

/**
 * GET /:txHash
 *
 * Stellar transaction hash'ine göre işlem durumunu sorgular.
 * Yalnızca işlemin sahibi olan üye işyeri sorgulayabilir.
 */
export async function getTransactionStatus(req, res) {
  try {
    const { txHash } = req.params;
    const transaction = await Transaction.findOne({ txHash });

    if (!transaction) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'İşlem bulunamadı.' });
    }
    if (transaction.merchantId.toString() !== req.merchantId) {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Yalnızca kendi işleminizi sorgulayabilirsiniz.' });
    }

    res.status(200).json({
      transactionId: transaction._id.toString(),
      txHash: transaction.txHash,
      status: transaction.status,
      totalAmount: transaction.totalAmount,
      ledgerNumber: transaction.ledgerNumber ?? null,
    });
  } catch (error) {
    logger.error(`[Transaction] getTransactionStatus hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'İşlem sorgulanamadı.' });
  }
}

router.post('/submit', validateTransactionSubmit, submitAuthMiddleware, idempotencyMiddleware, submitTransactionHandler);
router.get('/:txHash', authMiddleware, getTransactionStatus);

export default router;
