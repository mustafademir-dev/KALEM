/**
 * Canlı İşlem Akışı Route'ları — `/flow` panelinin veri uçları
 *
 * GET /api/v1/flow/latest?token=…  — akış olayı olan en yeni işlemin anlık görüntüsü
 * GET /api/v1/flow/stream?token=…  — Server-Sent Events: her yeni akış olayında
 *                                    işlemin güncel anlık görüntüsü
 *
 * Panel sayfasının kendisi (`GET /flow`) statiktir ve veri içermez; bkz. index.js.
 *
 * ## Erişim
 *
 * `FLOW_PANEL_TOKEN` tanımlı değilse uçlar 503 döner (panel kapalı). Token
 * sorgu parametresiyle gelir, çünkü tarayıcının `EventSource`'u özel başlık
 * gönderemez. Karşılaştırma sabit zamanlıdır (timing-safe).
 *
 * ## Neden SSE (WebSocket değil)
 *
 * Akış tek yönlüdür (sunucu → panel). SSE düz HTTP'dir; Render/Cloudflare
 * proxy zincirinden ek ayar olmadan geçer, tarayıcı kopan bağlantıyı kendisi
 * yeniden kurar. Proxy'lerin boşta bağlantıyı kesmemesi için 20 sn'de bir
 * yorum satırı (kalp atışı) gönderilir.
 */

import { Router } from 'express';
import { timingSafeEqual, createHash } from 'node:crypto';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { flowReadRateLimiter } from '../middleware/rate-limit.middleware.js';
import { getLatestFlow, subscribeFlow } from '../../services/flow-events.service.js';

const router = Router();

const HEARTBEAT_MS = 20_000;

let openStreams = 0;

/** Açık yayın cevapları — kapanışta sonlandırılır (aksi halde server.close() onları sonsuza dek bekler). */
const activeStreams = new Set();

/** Tüm açık panel yayınlarını kapatır. Sunucu kapanışında çağrılır. */
export function closeAllFlowStreams() {
  for (const res of activeStreams) res.end();
}

/** Sabit zamanlı karşılaştırma — uzunluk farkı da sızmasın diye hash'lenir. */
function tokenMatches(provided, expected) {
  const a = createHash('sha256').update(String(provided ?? '')).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

export function flowTokenMiddleware(req, res, next) {
  if (!config.flowPanel.token) {
    return res
      .status(503)
      .json({ error: 'FLOW_PANEL_DISABLED', message: 'Canlı işlem akışı paneli yapılandırılmamış (FLOW_PANEL_TOKEN).' });
  }
  if (!tokenMatches(req.query.token, config.flowPanel.token)) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Geçersiz panel token\'ı.' });
  }
  next();
}

export async function getLatestFlowHandler(req, res) {
  try {
    const flow = await getLatestFlow();
    res.status(200).json({ flow });
  } catch (error) {
    logger.error(`[Flow] getLatestFlowHandler hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'İşlem akışı alınamadı.' });
  }
}

export async function streamFlowHandler(req, res) {
  if (openStreams >= config.flowPanel.maxStreams) {
    return res.status(429).json({ error: 'TOO_MANY_STREAMS', message: 'Çok fazla açık panel bağlantısı var.' });
  }
  openStreams += 1;

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Ara proxy'lerin (nginx türevi) yanıtı tamponlamaması için.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  activeStreams.add(res);

  const send = (event, payload) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  // Abonelik anlık görüntüden ÖNCE açılır: arada gelen bir olay kaçmasın.
  const unsubscribe = subscribeFlow((flow) => send('flow', { flow }));
  const heartbeat = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), HEARTBEAT_MS);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    activeStreams.delete(res);
    openStreams -= 1;
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);

  try {
    send('snapshot', { flow: await getLatestFlow() });
  } catch (error) {
    logger.error(`[Flow] Akış anlık görüntüsü alınamadı: ${error.message}`);
    send('error', { message: 'Anlık görüntü alınamadı.' });
  }
}

router.get('/latest', flowReadRateLimiter, flowTokenMiddleware, getLatestFlowHandler);
router.get('/stream', flowReadRateLimiter, flowTokenMiddleware, streamFlowHandler);

export default router;
