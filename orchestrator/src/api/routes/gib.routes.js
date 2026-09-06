/**
 * GİB Belgesi (e-Belge/ÖKC Fiş Simülasyonu) Route'u
 *
 * GET /transactions/:txHash/gib-document — bir işleme ait, SSE dinleyicisi
 * tarafından otomatik üretilmiş GİB belge taslağını döndürür
 * (bkz. gib-simulator.service.js, sse-listener.service.js).
 *
 * İKİ erişim yolu vardır:
 * 1. Esnaf — `Authorization: Bearer <apiKey>` VARSA — yalnızca KENDİ
 *    işleminin belgesini görebilir (`transaction.merchantId` eşleşmesi).
 *    Bu, `auth.middleware.js`'teki `authMiddleware`'in AYNI mantığıdır;
 *    burada kasıtlı olarak KOŞULLU olduğu için (yalnızca Bearer VARSA
 *    devreye girer, müşteri yolunda hiç çalışmaz) o middleware doğrudan
 *    zincire eklenemedi — mantığı burada yeniden uygulanmıştır.
 * 2. Müşteri — Authorization YOKSA — `?senderAddress=G...` query
 *    parametresi `transaction.senderAddress` ile eşleşmelidir. İmza
 *    İSTENMEZ: bu bir e-Belge/fiş görüntülemedir, gizli bir finansal
 *    işlem değildir — müşterinin zaten kendi ekranında gördüğü txHash'i
 *    VE kendi cüzdan adresini bilmesi yeterli bir bariyer sayılmıştır.
 *    (Bilinçli bir kapsam genişletmesi — orijinal istek yalnızca
 *    esnaf-auth'tan bahsediyordu; müşteri tarafında da buton istendiği
 *    için eklendi, bkz. proje notu/onay turu.)
 */

import { Router } from 'express';
import Transaction from '../../models/Transaction.model.js';
import GibDocument from '../../models/GibDocument.model.js';
import Merchant from '../../models/Merchant.model.js';
import { hashApiKey } from '../../utils/crypto.js';
import logger from '../../utils/logger.js';
import { gibReadRateLimiter } from '../middleware/rate-limit.middleware.js';

const router = Router();

export async function getGibDocumentHandler(req, res) {
  try {
    const { txHash } = req.params;
    const transaction = await Transaction.findOne({ txHash });
    if (!transaction) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'İşlem bulunamadı.' });
    }

    const authHeader = req.get('Authorization') || '';

    if (authHeader.startsWith('Bearer ')) {
      // --- Esnaf yolu ---
      const token = authHeader.split(' ')[1];
      const merchant = token
        ? await Merchant.findOne({ apiKeyHash: hashApiKey(token) }).select('+apiKeyHash')
        : null;

      if (!merchant || !merchant.isActive) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Geçersiz API anahtarı.' });
      }
      if (transaction.merchantId.toString() !== merchant._id.toString()) {
        return res
          .status(403)
          .json({ error: 'FORBIDDEN', message: 'Yalnızca kendi işleminizin belgesini görüntüleyebilirsiniz.' });
      }
    } else {
      // --- Müşteri yolu ---
      const { senderAddress } = req.query;
      if (!senderAddress || transaction.senderAddress !== senderAddress) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Bu işlemin belgesini görüntüleme yetkiniz yok.' });
      }
    }

    const gibDoc = await GibDocument.findOne({ transactionId: transaction._id });
    if (!gibDoc) {
      return res
        .status(404)
        .json({ error: 'NOT_FOUND', message: 'Bu işlem için GİB belgesi henüz üretilmemiş.' });
    }

    res.status(200).json({
      transactionId: transaction._id.toString(),
      txHash: gibDoc.txHash,
      documentType: gibDoc.documentType,
      status: gibDoc.status,
      merchantTaxId: gibDoc.merchantTaxId,
      totalAmountTL: gibDoc.totalAmountTL,
      ublContent: gibDoc.ublContent,
      createdAt: gibDoc.createdAt,
    });
  } catch (error) {
    logger.error(`[GİB] getGibDocumentHandler hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'GİB belgesi alınamadı.' });
  }
}

router.get('/:txHash/gib-document', gibReadRateLimiter, getGibDocumentHandler);

export default router;
