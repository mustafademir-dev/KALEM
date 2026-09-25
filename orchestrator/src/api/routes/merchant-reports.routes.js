/**
 * Esnaf Raporlama Route'ları (yalnızca OKUMA — ödeme yoluna dokunmaz)
 *
 * GET /api/v1/merchants/:id/dashboard        — ana ekran: bakiye, bugünkü özet, son işlemler, Sosyal Fon
 * GET /api/v1/merchants/:id/transactions     — sayfalı işlem listesi (Faturalarım)
 * GET /api/v1/merchants/:id/reports/daily    — gün sonu CSV (SİMÜLASYON damgalı)
 *
 * Hepsi esnaf Bearer API anahtarı ister ve esnaf yalnızca KENDİ verisini görür
 * (`GET /:id/balance` ile aynı kural).
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import Merchant from '../../models/Merchant.model.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { merchantReadRateLimiter, merchantReportRateLimiter } from '../middleware/rate-limit.middleware.js';
import {
  buildDashboard,
  listTransactions,
  parseCursor,
  buildDailyReportCsv,
  istanbulDayRange,
  istanbulToday,
} from '../../services/merchant-report.service.js';
import logger from '../../utils/logger.js';

const router = Router();

/** `:id` geçerli ve isteği yapan esnafın kendisi mi? Değilse yanıtı yazar ve `null` döner. */
async function loadOwnMerchant(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz üye işyeri id.' });
    return null;
  }
  if (req.merchantId !== id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca kendi verilerinizi görüntüleyebilirsiniz.' });
    return null;
  }
  const merchant = await Merchant.findById(id);
  if (!merchant) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Üye işyeri bulunamadı.' });
    return null;
  }
  return merchant;
}

export async function getDashboardHandler(req, res) {
  try {
    const merchant = await loadOwnMerchant(req, res);
    if (!merchant) return;
    res.status(200).json(await buildDashboard(merchant));
  } catch (error) {
    logger.error(`[Report] getDashboardHandler hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Ana ekran verileri alınamadı.' });
  }
}

export async function listTransactionsHandler(req, res) {
  try {
    const merchant = await loadOwnMerchant(req, res);
    if (!merchant) return;

    const parsedLimit = parseInt(req.query.limit ?? '20', 10);
    const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 1), 50);

    let cursor = null;
    if (req.query.cursor !== undefined) {
      cursor = parseCursor(req.query.cursor);
      if (!cursor) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz cursor.' });
    }

    let date = null;
    if (req.query.date !== undefined) {
      if (!istanbulDayRange(req.query.date)) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'date, YYYY-MM-DD biçiminde geçerli bir tarih olmalı.' });
      }
      date = req.query.date;
    }

    res.status(200).json(await listTransactions(merchant._id, { limit, cursor, date }));
  } catch (error) {
    logger.error(`[Report] listTransactionsHandler hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'İşlemler alınamadı.' });
  }
}

export async function dailyReportHandler(req, res) {
  try {
    const merchant = await loadOwnMerchant(req, res);
    if (!merchant) return;

    const date = req.query.date ?? istanbulToday();
    if (!istanbulDayRange(date)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'date, YYYY-MM-DD biçiminde geçerli bir tarih olmalı.' });
    }

    const csv = await buildDailyReportCsv(merchant, date);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kalem-gun-sonu-${date}.csv"`,
      'Cache-Control': 'no-store',
    });
    res.status(200).send(csv);
  } catch (error) {
    logger.error(`[Report] dailyReportHandler hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Gün sonu raporu üretilemedi.' });
  }
}

router.get('/:id/dashboard', merchantReadRateLimiter, authMiddleware, getDashboardHandler);
router.get('/:id/transactions', merchantReadRateLimiter, authMiddleware, listTransactionsHandler);
router.get('/:id/reports/daily', merchantReportRateLimiter, authMiddleware, dailyReportHandler);

export default router;
