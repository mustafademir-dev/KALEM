/**
 * KALEM Orkestrasyon Katmanı — Sunucu Giriş Noktası
 *
 * Express.js sunucusunu başlatır, MongoDB'ye bağlanır,
 * route'ları ve middleware'leri bağlar, SSE listener'ı ve
 * Havuz 4→2 besleme cron job'ını başlatır.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import config from './config/index.js';
import logger from './utils/logger.js';

// --- Route'lar ---
import transactionRoutes from './api/routes/transaction.routes.js';
import merchantRoutes from './api/routes/merchant.routes.js';
import merchantReportRoutes from './api/routes/merchant-reports.routes.js';
import healthRoutes from './api/routes/health.routes.js';
import faucetRoutes from './api/routes/faucet.routes.js';
import gibRoutes from './api/routes/gib.routes.js';
import flowRoutes, { closeAllFlowStreams } from './api/routes/flow.routes.js';

// --- Servisler ---
import { startSSEListener } from './services/sse-listener.service.js';
import { startPoolFeederCron } from './services/pool-feeder.service.js';
import { startReconciliationCron } from './services/reconciliation.service.js';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * `trust proxy` — rate limiting'in IP bazlı katmanının doğruluğu buna bağlıdır
 * (bkz. docs/ARCHITECTURE_DECISIONS.md §6.2, rate-limit.middleware.js).
 *
 * Değer, uygulamanın ÖNÜNDEKİ güvenilen reverse proxy sayısıdır:
 * - Yerelde proxy yoktur → `0` (Express `req.ip`'yi doğrudan soketten okur).
 * - **Render'da `3`** — canlı ölçümle bulundu (§6.2.2), tahmin DEĞİLDİR.
 *   Express soket bağlantısını da hop sayar; zincir: `::1` → Render iç LB →
 *   Cloudflare → gerçek istemci. Yeni bir host'a taşınırsa YENİDEN ÖLÇÜLMELİ.
 *
 * YANLIŞ AYARLANIRSA iki yönde de kırılır: çok düşükse `req.ip` herkes için
 * proxy'nin IP'si olur ve tüm kullanıcılar tek sayacı paylaşıp TOPLUCA
 * kilitlenir; `true`/çok yüksekse saldırgan `X-Forwarded-For` başlığını
 * uydurarak limiti tamamen atlar.
 */
app.set('trust proxy', config.trustProxyHops);
logger.info(`[Server] trust proxy = ${config.trustProxyHops} (TRUST_PROXY_HOPS)`);

/**
 * CORS: geliştirmede herhangi bir `localhost`/`127.0.0.1` portu (Expo web dev
 * sunucusu her başlatmada farklı porta düşebilir) her zaman izinlidir; ayrıca
 * `config.corsAllowedOrigins`'te (env `CORS_ALLOWED_ORIGINS`) listelenen sabit
 * origin'lere de izin verilir — prod/demo sunucu adresi netleşince oraya
 * eklenecektir (bkz. docs/ARCHITECTURE_DECISIONS.md §6.6).
 */
const LOCALHOST_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || LOCALHOST_ORIGIN_RE.test(origin) || config.corsAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: izin verilmeyen origin: ${origin}`));
    },
  })
);

app.use(express.json());

// ---------------------------------------------------------------------------
// Route'lar
// ---------------------------------------------------------------------------
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/transactions', gibRoutes); // /:txHash/gib-document — ayrı dosya, aynı URL alanı
app.use('/api/v1/merchants', merchantRoutes);
app.use('/api/v1/merchants', merchantReportRoutes); // /:id/dashboard, /transactions, /reports/daily — okuma uçları
app.use('/api/v1/faucet', faucetRoutes);
app.use('/api/v1/flow', flowRoutes);

/**
 * Canlı İşlem Akışı paneli — projektöre/ikinci cihaza açılan statik sayfa.
 * Sayfa veri içermez; verisini token'lı `/api/v1/flow/*` uçlarından alır.
 * Aynı origin'den sunulduğu için CORS ayarı gerektirmez.
 */
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
app.get('/flow', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'flow.html'));
});

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

    // Mutabakat job'ı — SSE'nin kaçırdığı onayları Horizon'dan yakalar (§6.4).
    // SSE tek başına güvenilir bir garanti DEĞİLDİR: canlı dağıtımda akış
    // sessizce hiç mesaj almayabiliyor ve ücretsiz planda süreç uykuya geçiyor.
    const reconciliationTask = startReconciliationCron();

    // HTTP sunucusu
    const server = app.listen(config.port, () => {
      logger.info(`[Server] KALEM Orkestrasyon Katmanı — port ${config.port}`);
      logger.info(`[Server] Ortam: ${config.nodeEnv}`);
    });

    const shutdown = (signal) => {
      logger.info(`[Server] ${signal} alındı, kapatılıyor...`);
      closeSSEStream?.();
      poolFeederTask?.stop();
      reconciliationTask?.stop();
      // Açık panel yayınları kapatılmazsa server.close() onları sonsuza dek bekler.
      closeAllFlowStreams();
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
