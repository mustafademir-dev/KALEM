/**
 * KALEM Orkestrasyon Katmanı — Sunucu Giriş Noktası
 *
 * Express.js sunucusunu başlatır, MongoDB'ye bağlanır,
 * route'ları ve middleware'leri bağlar, SSE listener'ı ve
 * Havuz 4→2 besleme cron job'ını başlatır.
 */

import express from 'express';
import mongoose from 'mongoose';
import config from './config/index.js';
import logger from './utils/logger.js';

// --- Route'lar ---
import transactionRoutes from './api/routes/transaction.routes.js';
import merchantRoutes from './api/routes/merchant.routes.js';
import healthRoutes from './api/routes/health.routes.js';

// --- Servisler ---
import { startSSEListener } from './services/sse-listener.service.js';
import { startPoolFeederCron } from './services/pool-feeder.service.js';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());

// ---------------------------------------------------------------------------
// Route'lar
// ---------------------------------------------------------------------------
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/merchants', merchantRoutes);

// ---------------------------------------------------------------------------
// MongoDB Bağlantısı ve Sunucu Başlatma
// ---------------------------------------------------------------------------

async function start() {
  try {
    // MongoDB bağlantısı
    await mongoose.connect(config.mongodbUri);
    logger.info('[MongoDB] Bağlantı başarılı.');

    // SSE Listener başlat (Havuz 2 üzerinden fee-bump'lı işlem onaylarını yakalar)
    const closeSSEStream = startSSEListener();

    // Havuz 4→2 besleme cron job'ını başlat
    const poolFeederTask = startPoolFeederCron();

    // HTTP sunucusu
    const server = app.listen(config.port, () => {
      logger.info(`[Server] KALEM Orkestrasyon Katmanı — port ${config.port}`);
      logger.info(`[Server] Ortam: ${config.nodeEnv}`);
    });

    const shutdown = (signal) => {
      logger.info(`[Server] ${signal} alındı, kapatılıyor...`);
      closeSSEStream?.();
      poolFeederTask?.stop();
      server.close(() => {
        mongoose.connection.close(false).finally(() => process.exit(0));
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('[Server] Başlatma hatası:', err);
    process.exit(1);
  }
}

start();

export default app;
