/**
 * Müşteri Route'ları
 *
 * POST /api/v1/customers/register — TC + 6 haneli PIN ile hesap açma
 * POST /api/v1/customers/login    — giriş; yeni cihazdaysa bakiye taşınır
 * POST /api/v1/customers/refunds  — müşterinin KENDİ iadeleri.
 * POST /api/v1/customers/receipts — müşterinin fiş geçmişi (önceki cihazlar dahil).
 *
 * Kayıt/girişte cihazdaki cüzdanın sahipliği de imzayla kanıtlanır
 * (bkz. services/customer-account.service.js).
 *
 * Müşterinin API anahtarı yoktur; adres sahipliğini faucet ile aynı desenle,
 * `KALEM-CUSTOMER-REFUNDS:{address}:{timestamp}` mesajını cüzdan anahtarıyla
 * imzalayarak kanıtlar. İmza şart: yanıt fiş numarası (dolayısıyla işletme)
 * içerdiği için yalnızca adresi bilmek yetmemeli — adresler zincirde herkese açık.
 */

import { Router } from 'express';
import * as StellarSdk from '@stellar/stellar-sdk';
import Transaction from '../../models/Transaction.model.js';
import GibDocument from '../../models/GibDocument.model.js';
import Merchant from '../../models/Merchant.model.js';
import { buildCustomerRefundsChallenge, buildCustomerReceiptsChallenge } from '../../utils/crypto.js';
import { gibReadRateLimiter, accountAuthRateLimiter } from '../middleware/rate-limit.middleware.js';
import {
  registerCustomer,
  loginCustomer,
  customerAddresses,
  AccountError,
} from '../../services/customer-account.service.js';
import logger from '../../utils/logger.js';

const router = Router();
const CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * İmzalı istek kontrolü: adres geçerli, zaman damgası taze, imza adresin sahibinden.
 * Hata varsa yanıtı yazar ve `false` döner.
 */
function verifySignedRequest(req, res, buildChallenge) {
  const { address, timestamp, signature } = req.body || {};
  if (!address || typeof address !== 'string' || !StellarSdk.StrKey.isValidEd25519PublicKey(address)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'address geçerli bir Stellar adresi olmalıdır.' });
    return false;
  }
  if (typeof timestamp !== 'number' || Math.abs(Date.now() - timestamp) > CHALLENGE_MAX_AGE_MS) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'timestamp eksik ya da çok eski.' });
    return false;
  }
  let verified = false;
  try {
    verified = StellarSdk.Keypair.fromPublicKey(address).verify(
      Buffer.from(buildChallenge(address, timestamp), 'utf8'),
      Buffer.from(String(signature ?? ''), 'base64')
    );
  } catch {
    verified = false;
  }
  if (!verified) {
    res.status(403).json({ error: 'OWNERSHIP_PROOF_FAILED', message: 'İmza adres sahipliğini kanıtlamıyor.' });
    return false;
  }
  return true;
}

export async function listCustomerRefundsHandler(req, res) {
  try {
    if (!verifySignedRequest(req, res, buildCustomerRefundsChallenge)) return;
    const addresses = await customerAddresses(req.body.address);

    const txs = await Transaction.find({ senderAddress: { $in: addresses }, 'refund.status': 'completed' })
      .sort({ 'refund.completedAt': -1 })
      .limit(40)
      .select('txHash totalAmount gibDocumentId refund.completedAt')
      .lean();
    const docs = await GibDocument.find({ _id: { $in: txs.map((t) => t.gibDocumentId).filter(Boolean) } })
      .select('ublContent.Invoice.ID')
      .lean();
    const docNo = new Map(docs.map((d) => [String(d._id), d.ublContent?.Invoice?.ID ?? null]));

    res.status(200).json({
      refunds: txs.map((t) => ({
        txHash: t.txHash,
        amount: t.totalAmount,
        documentNo: docNo.get(String(t.gibDocumentId)) ?? null,
        refundedAt: t.refund?.completedAt ?? null,
      })),
    });
  } catch (error) {
    logger.error(`[Customer] listCustomerRefundsHandler hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'İadeler alınamadı.' });
  }
}

function accountHandler(action, successStatus) {
  return async (req, res) => {
    try {
      const { tc, pin, address, timestamp, signature } = req.body || {};
      const result = await action({ tc: String(tc ?? '').trim(), pin, address, timestamp, signature });
      res.status(successStatus).json(result);
    } catch (error) {
      if (error instanceof AccountError) {
        return res.status(error.httpStatus).json({ error: error.code, message: error.message });
      }
      logger.error(`[Customer] hesap işlemi hatası: ${error.message}`);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'İşlem tamamlanamadı, tekrar deneyin.' });
    }
  };
}

export const registerCustomerHandler = accountHandler(registerCustomer, 201);
export function createLoginHandler(deps) {
  return accountHandler((input) => loginCustomer(input, deps), 200);
}

router.post('/register', accountAuthRateLimiter, registerCustomerHandler);
router.post('/login', accountAuthRateLimiter, createLoginHandler());
/**
 * Fiş geçmişi: hesabın şu anki ve önceki cüzdanlarından yapılan onaylı ödemeler
 * (en yeni 40). Yeni telefonda eski fişler de görünsün diye.
 */
export async function listCustomerReceiptsHandler(req, res) {
  try {
    if (!verifySignedRequest(req, res, buildCustomerReceiptsChallenge)) return;
    const addresses = await customerAddresses(req.body.address);

    const txs = await Transaction.find({ senderAddress: { $in: addresses }, status: 'confirmed' })
      .sort({ createdAt: -1 })
      .limit(40)
      .select('txHash totalAmount senderAddress merchantId createdAt refund.status refund.completedAt')
      .lean();
    const merchants = await Merchant.find({ _id: { $in: [...new Set(txs.map((t) => String(t.merchantId)))] } })
      .select('businessName')
      .lean();
    const nameOf = new Map(merchants.map((m) => [String(m._id), m.businessName]));

    res.status(200).json({
      receipts: txs
        .filter((t) => t.txHash)
        .map((t) => ({
          txHash: t.txHash,
          totalAmount: t.totalAmount,
          businessName: nameOf.get(String(t.merchantId)) ?? null,
          paidAt: new Date(t.createdAt).toISOString(),
          senderAddress: t.senderAddress,
          refundedAt: t.refund?.status === 'completed' ? t.refund.completedAt : null,
        })),
    });
  } catch (error) {
    logger.error(`[Customer] listCustomerReceiptsHandler hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Fiş geçmişi alınamadı.' });
  }
}

router.post('/refunds', gibReadRateLimiter, listCustomerRefundsHandler);
router.post('/receipts', gibReadRateLimiter, listCustomerReceiptsHandler);

export default router;
