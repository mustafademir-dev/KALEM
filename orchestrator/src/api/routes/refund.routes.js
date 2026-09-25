/**
 * Esnaf İade Route'u (prototip)
 *
 * POST /api/v1/merchants/:id/refunds  { "documentNo": "KALEM20260925123456" }
 *
 * Esnaf Bearer API anahtarı ister; esnaf yalnızca KENDİ fişini iade edebilir.
 * Zincir adımları ve sınırlar için bkz. services/refund.service.js.
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import Merchant from '../../models/Merchant.model.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { merchantReportRateLimiter } from '../middleware/rate-limit.middleware.js';
import { refundPayment, RefundError } from '../../services/refund.service.js';
import logger from '../../utils/logger.js';

const router = Router();

export function createRefundHandler(deps) {
  return async function refundHandler(req, res) {
    try {
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz üye işyeri id.' });
      }
      if (req.merchantId !== id) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca kendi fişlerinizi iade edebilirsiniz.' });
      }

      const documentNo = typeof req.body?.documentNo === 'string' ? req.body.documentNo.trim() : '';
      if (!documentNo || documentNo.length > 64) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Fiş numarası (documentNo) zorunludur.' });
      }

      const merchant = await Merchant.findById(id);
      if (!merchant) {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Üye işyeri bulunamadı.' });
      }

      const { transaction } = await refundPayment({ merchant, documentNo, ...(deps ? { deps } : {}) });
      res.status(200).json({
        documentNo,
        transactionId: transaction._id.toString(),
        refundedAmount: transaction.totalAmount,
        customerAddress: transaction.senderAddress,
        refund: {
          status: transaction.refund.status,
          completedAt: transaction.refund.completedAt,
          steps: transaction.refund.steps.map((s) => ({ name: s.name, txHash: s.txHash })),
        },
      });
    } catch (error) {
      if (error instanceof RefundError) {
        return res.status(error.httpStatus).json({ error: error.code, message: error.message });
      }
      logger.error(`[Refund] refundHandler hatası: ${error.message}`);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'İade yapılamadı.' });
    }
  };
}

router.post('/:id/refunds', merchantReportRateLimiter, authMiddleware, createRefundHandler());

export default router;
