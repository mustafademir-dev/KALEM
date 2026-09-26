/**
 * İşlem (Transaction) Route'ları
 *
 * POST /api/v1/transactions/submit — İmzalı XDR paketini kabul eder
 * GET  /api/v1/transactions/:txHash — İşlem durumu sorgulama
 * POST /api/v1/transactions/:txHash/merchant-ack — Esnaf ekranı ödemeyi gördü (akış 9. adım)
 */

import { Router } from 'express';
import * as StellarSdk from '@stellar/stellar-sdk';
import stellarConfig from '../../config/stellar.js';
import Transaction from '../../models/Transaction.model.js';
import Merchant from '../../models/Merchant.model.js';
import {
  wrapAndSubmitFeeBump,
  verifySignedBySource,
  extractHorizonResultCodes,
  readContractCall,
} from '../../services/fee-bump.service.js';
import { finalizeIdempotencyKey } from '../../services/idempotency.service.js';
import { recordFlowEvent } from '../../services/flow-events.service.js';
import { recordChainOutcome } from '../../services/contract-events.service.js';
import { handleTransaction } from '../../services/sse-listener.service.js';
import { sanitizeCartItems } from '../../utils/cart-items.js';
import { authMiddleware, submitAuthMiddleware } from '../middleware/auth.middleware.js';
import { validateTransactionSubmit } from '../middleware/validation.middleware.js';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware.js';
import {
  submitIpRateLimiter,
  submitIdentityRateLimiter,
} from '../middleware/rate-limit.middleware.js';
import logger from '../../utils/logger.js';

const router = Router();

/** İmzalı işlemin içeriği, istekteki ödeme bilgisiyle (esnaf/tutar) uyuşmuyor. */
class PaymentMismatchError extends Error {}

/**
 * Sponsorlu yol YALNIZCA `pay_merchant` taşır ve fiş, zincire gidecek olan işlemin
 * GERÇEK içeriğiyle birebir aynı olmalıdır. Aksi hâlde:
 * - çıplak `dtl-token.transfer(müşteri → esnaf)` ile %0,1 + %0,3 kesinti atlatılır
 *   (üstelik ücretini Havuz 2 öderdi);
 * - fiş tutarı/esnafı istek gövdesinden geldiği için 1 TL ödeyip 1.000 TL'lik ya da
 *   başka esnafın VKN'siyle fiş ürettirilebilirdi.
 * Bu kontroller senkron ve ücretsizdir (ağa/DB'ye gitmez). Esnaf adresi eşleşmesi DB
 * okuması gerektirdiği için ön-simülasyonla paralel yapılır (bkz. handler).
 *
 * @returns {{merchantAddress: string} | {error: string}}
 */
export function checkPaymentCall(innerTx, senderAddress, totalAmount) {
  const call = readContractCall(innerTx);
  if (!call || call.functionName !== 'pay_merchant' || call.args.length !== 3) {
    return { error: 'Yalnızca esnafa ödeme (pay_merchant) işlemi kabul edilir.' };
  }
  const [from, merchantAddress, amount] = call.args;
  if (from !== senderAddress) {
    return { error: 'Ödemeyi yapan hesap, işlemi imzalayan hesapla aynı olmalıdır.' };
  }
  if (typeof amount !== 'bigint' || amount !== BigInt(totalAmount)) {
    return { error: 'İşlemdeki tutar, ödeme tutarıyla uyuşmuyor.' };
  }
  if (typeof merchantAddress !== 'string') {
    return { error: 'İşlemdeki esnaf adresi okunamadı.' };
  }
  return { merchantAddress };
}

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
  const { signedXdr, merchantId, totalAmount, cartItems } = req.body;
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
  let innerTxHash = null;
  let signatureCheck = null;
  let paymentCheck = null;
  try {
    const innerTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, stellarConfig.networkPassphrase);
    senderAddress = innerTx.source;
    // Akışın 1. adımı: imzanın gerçekten kaynak hesaba ait olduğunun yerel
    // doğrulaması. Müşteri yolunda bu doğrulama submitAuthMiddleware'de,
    // idempotency kilidinden ÖNCE yapılmıştır — zaman oradan alınır. Esnaf
    // (Bearer) yolunda orada imza kontrolü yoktur; an burasıdır. (Fee-bump
    // servisi aynı kontrolü ücret harcamadan önce bir kez daha yapar.)
    if (!(innerTx instanceof StellarSdk.FeeBumpTransaction)) {
      innerTxHash = innerTx.hash().toString('hex');
      signatureCheck = {
        valid: verifySignedBySource(innerTx),
        at: req.signatureVerifiedAt ?? new Date(),
      };
    }
    paymentCheck = checkPaymentCall(innerTx, senderAddress, totalAmount);
  } catch {
    await finalizeIdempotencyKey(idempotencyKey, 'failed', { error: 'VALIDATION_ERROR' }).catch((err) => {
      logger.error(`[Transaction] finalize (parse) hatası: ${err.message}`);
    });
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'signedXdr ayrıştırılamadı.' });
  }

  if (paymentCheck.error) {
    await finalizeIdempotencyKey(idempotencyKey, 'failed', { error: 'PAYMENT_MISMATCH' }).catch((err) => {
      logger.error(`[Transaction] finalize (payment mismatch) hatası: ${err.message}`);
    });
    return res.status(400).json({ error: 'PAYMENT_MISMATCH', message: paymentCheck.error });
  }

  let transaction;
  let creation = null;
  // Fee-Bump servisinin hangi aşamaya kadar ilerlediği — hata hangi adımda
  // oluştuysa zaman çizelgesinde O adım kırmızıya döner.
  let feeBumpDone = false;
  let sentAt = null;
  let chainAccepted = false;
  try {
    // İşlem kaydı, Fee-Bump servisindeki ön-simülasyonla (ağ gecikmesi) PARALEL
    // yazılır — ikisi birbirine bağlı değil.
    // Horizon'a göndermeden önce (`beforeSend`) kaydın yazıldığı GARANTİ
    // edilir: kaydı olmayan bir işlem asla zincire gitmez.
    // Önce esnaf: işlemdeki alıcı adres, fişin kesileceği esnafın (merchantId) zincir
    // adresi olmalı. Uyuşmazsa kayıt yazılmaz ve `beforeSend` kapısı ağa gidişi keser.
    creation = Merchant.findById(merchantId)
      .select('stellarAddress')
      .lean()
      .then((merchant) => {
        if (!merchant || merchant.stellarAddress !== paymentCheck.merchantAddress) {
          throw new PaymentMismatchError('İşlemdeki esnaf adresi, ödeme yapılan işletmeyle uyuşmuyor.');
        }
        return Transaction.create({
          idempotencyKey,
          senderAddress,
          innerTxHash,
          merchantId,
          totalAmount,
          // Sepet GİB fişi içindir; temizleyici asla hata fırlatmaz (geçersiz → []).
          cartItems: sanitizeCartItems(cartItems),
          status: 'pending',
        });
      });
    creation.catch(() => {}); // hata aşağıda `await creation` ile ele alınır; işlenmemiş ret olmasın

    // Akış olayları beklenmez (await yok): kayıt, ödemeyi yavaşlatmamalı. Olaylar
    // kaydın yazılmasından SONRA, kaydedildikleri sırayla işlenir (Promise
    // reaksiyonları kayıt sırasıyla çalışır); işlem başı sıra ayrıca
    // flow-events servisindeki zincirle korunur.
    const record = (step, opts) => {
      creation.then(
        (created) => recordFlowEvent(created._id, step, opts),
        () => {} // kayıt yazılamadıysa olay da yazılmaz; asıl hata catch bloğunda
      );
    };
    if (signatureCheck) {
      record('signed', {
        status: signatureCheck.valid ? 'done' : 'failed',
        at: signatureCheck.at,
        data: { signer: senderAddress, innerTxHash, algorithm: 'Ed25519' },
      });
    }
    record('received', {
      at: req.idempotencyLockedAt ?? new Date(),
      data: {
        idempotencyKey,
        lock: 'acquired',
        authPath: req.merchantId ? 'merchant_api_key' : 'customer_signature',
      },
    });

    const response = await wrapAndSubmitFeeBump(signedXdr, {
      onProgress: (stage, data) => {
        if (stage === 'fee_bump') {
          feeBumpDone = true;
          record('fee_bump', { data });
        } else if (stage === 'sending') {
          sentAt = data.sentAt;
        }
      },
      beforeSend: async () => {
        transaction = await creation;
      },
    });

    // Buradan sonra işlem zincirdedir: sonraki bir DB/idempotency hatası
    // 4. adımı "başarısız" gösteremez.
    chainAccepted = true;
    recordFlowEvent(transaction._id, 'submitted', {
      data: { txHash: response.hash, ledger: response.ledger ?? null, sentAt, network: 'horizon' },
    });

    transaction.status = 'submitted';
    transaction.txHash = response.hash;

    // Horizon'un senkron cevabı = işlem ledger'da (§9.9). Client'ın zincir onayı
    // için ayrıca Horizon'u yoklamasına gerek kalmasın diye hash ve ledger
    // yanıtta döner (idempotency replay'i de aynı sonucu taşır).
    const result = {
      transactionId: transaction._id.toString(),
      status: 'submitted',
      txHash: response.hash,
      ledger: response.ledger ?? null,
      message: 'İşlem Fee-Bump ile sarmalanarak Stellar ağına iletildi.',
    };

    // `save` ile idempotency kaydının kapatılması BAĞIMSIZ — paralel yazılır
    // (kritik yoldan bir sıralı Mongo yazması çıkar). Yanıt ikisi de bitince
    // gider; böylece 'completed' anlamı değişmez (hızlı bir yeniden deneme
    // 409 değil, replay alır).
    const persisted = transaction.save().then(() => {
      // 5. ve 6. adımlar: kontrat olayları RPC'den okunur — cevabı bekletmeden arka planda.
      recordChainOutcome(transaction._id, response.hash);

      // 7. adım (Onaylandı) + GİB: Horizon'un `submitTransaction()` cevabı
      // ZATEN SENKRON — işlem ledger'a yazılana kadar bekler, hash+ledger'ı
      // burada döner (bkz. docs §9.9). SSE'yi (Render'da güvenilmez, hiç
      // mesaj almayabiliyor) ya da mutabakat turunu (30 sn'ye kadar
      // gecikebilir) beklemeye GEREK YOK — onayı burada, hemen, doğrudan
      // işleriz. `handleTransaction` üç yoldan (bu çağrı / SSE / mutabakat)
      // hangisi önce varırsa onu atomik olarak kabul eder (bkz. o fonksiyondaki
      // `findOneAndUpdate`); geri kalanlar güvenle hiçbir şey yapmaz — çift
      // GİB belgesi üretilmez. Arama `txHash` ile yapıldığı için, kayıt
      // yazıldıktan SONRA (bu `then`) tetiklenmesi şarttır.
      handleTransaction(
        { hash: response.hash, ledger: response.ledger ?? null },
        { source: 'submit_response' }
      ).catch((err) => {
        logger.error(`[Transaction] Doğrudan onay tetikleme hatası: ${err.message}`);
      });
    });
    const outcomes = await Promise.allSettled([
      persisted,
      finalizeIdempotencyKey(idempotencyKey, 'completed', result),
    ]);
    // İkisi de bitmeden hata fırlatılmaz: catch bloğundaki 'failed' yazımı,
    // uçuştaki 'completed' yazımını geçemesin.
    const failed = outcomes.find((o) => o.status === 'rejected');
    if (failed) throw failed.reason;

    logger.info(`[Transaction] Gönderildi (id: ${transaction._id}, hash: ${response.hash})`);
    res.status(201).json(result);
  } catch (error) {
    logger.error(`[Transaction] submitTransactionHandler hatası: ${error.message}`);

    // Hata, kayıt yazılırken ya da ondan önce (ön-simülasyon) olmuş olabilir.
    if (!transaction && creation) transaction = await creation.catch(() => null);
    if (transaction) {
      transaction.status = 'failed';
      transaction.errorMessage = error.message;
      await transaction.save().catch((saveErr) => {
        logger.error(`[Transaction] Hata durumu kaydedilemedi: ${saveErr.message}`);
      });

      // Hata, Fee-Bump imzalanmadan önceyse (doğrulama/ön-simülasyon) 3. adımda,
      // sonraysa (Horizon reddi) 4. adımda gösterilir.
      if (!chainAccepted) {
        let resultCodes = null;
        try {
          resultCodes = extractHorizonResultCodes(error);
        } catch {
          resultCodes = null;
        }
        recordFlowEvent(transaction._id, feeBumpDone ? 'submitted' : 'fee_bump', {
          status: 'failed',
          data: { error: error.message, resultCodes, sentAt },
        });
      }
    }

    await finalizeIdempotencyKey(idempotencyKey, 'failed', { error: error.message }).catch((finalizeErr) => {
      logger.error(`[Idempotency] finalize (failed) hatası: ${finalizeErr.message}`);
    });

    if (error instanceof PaymentMismatchError) {
      return res.status(400).json({ error: 'PAYMENT_MISMATCH', message: error.message });
    }
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

/**
 * POST /:txHash/merchant-ack
 *
 * Canlı işlem akışının 9. adımı: esnaf ekranı (`EsnafQrScreen`) ödemeyi zincirde
 * gördüğünde bu ucu çağırır. Backend bu anı başka hiçbir yoldan bilemez — esnaf
 * istemcisi ödemeyi Soroban RPC'den KENDİSİ tespit eder, backend'e uğramaz.
 *
 * Esnaf Bearer API anahtarı zorunludur; yalnızca KENDİ işlemi için çağrılabilir.
 * İdempotenttir: ikinci çağrı yeni olay yazmaz, 200 döner.
 *
 * Request Body (opsiyonel): { "detectedLedger": 4628674 }
 */
export async function merchantAckHandler(req, res) {
  try {
    const { txHash } = req.params;
    const transaction = await Transaction.findOne({ txHash });

    if (!transaction) {
      // Esnaf ödemeyi, handler txHash'i kaydetmeden birkaç ms önce görmüş olabilir —
      // istemci kısa aralıkla yeniden dener.
      return res.status(404).json({ error: 'NOT_FOUND', message: 'İşlem bulunamadı.' });
    }
    if (transaction.merchantId.toString() !== req.merchantId) {
      return res
        .status(403)
        .json({ error: 'FORBIDDEN', message: 'Yalnızca kendi işleminiz için bildirim gönderebilirsiniz.' });
    }

    const alreadySeen = (transaction.flowEvents ?? []).some(
      (e) => e.step === 'merchant_seen' && e.status === 'done'
    );
    if (!alreadySeen) {
      const detectedLedger = Number.isInteger(req.body?.detectedLedger) ? req.body.detectedLedger : null;
      await recordFlowEvent(transaction._id, 'merchant_seen', {
        data: {
          businessName: req.merchant?.businessName ?? null,
          merchantAddress: req.merchant?.stellarAddress ?? null,
          detectedLedger,
          detectedVia: 'soroban_rpc_getEvents',
        },
      });
    }

    res.status(200).json({ acknowledged: true, duplicate: alreadySeen });
  } catch (error) {
    logger.error(`[Transaction] merchantAckHandler hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Bildirim kaydedilemedi.' });
  }
}

// Zincir sırası KRİTİK (bkz. rate-limit.middleware.js dosya başı):
// IP limiti pozisyon 0'da (parse/DB yok) → kimlik limiti ilk DB yazmasından ÖNCE.
router.post(
  '/submit',
  submitIpRateLimiter,
  validateTransactionSubmit,
  submitAuthMiddleware,
  submitIdentityRateLimiter,
  idempotencyMiddleware,
  submitTransactionHandler
);
router.get('/:txHash', authMiddleware, getTransactionStatus);
router.post('/:txHash/merchant-ack', authMiddleware, merchantAckHandler);

export default router;
