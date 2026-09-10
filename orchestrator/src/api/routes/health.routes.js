/**
 * Sağlık Kontrolü Route'ları
 *
 * İki ayrı uç, iki ayrı amaç (liveness / readiness ayrımı):
 *
 * - `GET /api/v1/health`       — **liveness**. HER ZAMAN 200 döner (süreç ayakta).
 *   Render'ın `healthCheckPath`'i ve "uyanık tutma" ping'i bunu kullanır.
 *   Bağımlılıklar bozuksa bile 200 döner; aksi halde geçici bir MongoDB
 *   kesintisi Render'da yeniden başlatma döngüsü tetikleyebilirdi.
 *
 * - `GET /api/v1/health/ready` — **readiness**. Kritik bir bağımlılık bozuksa
 *   **503** döner. İzleme/uyarı (uptime monitor) bunu kullanmalıdır.
 *
 * ## Neden SSE durumu da raporlanıyor
 *
 * Ücretsiz bulut planlarında servis trafik almadığında uyutulur. Uyandığında
 * HTTP tekrar cevap verir ama **SSE akışı ölü kalabilir** — bu durumda ödeme
 * zincire yazılır, onay yakalanmaz, GİB belgesi hiç üretilmez ve sistem
 * dışarıdan "çalışıyor" görünür. §6.4'te belgelendiği gibi kalıcı cursor
 * olmadığı için o pencerede kaçan onay KALICI olarak kaybolur. Bu uç, o sessiz
 * arızayı görünür kılar.
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import config from '../../config/index.js';
import { getSSEStatus } from '../../services/sse-listener.service.js';
import { isPrivateOrLoopbackIp } from '../../utils/net.js';

const router = Router();

/** SSE akışı bu süre boyunca hiç mesaj almadıysa "durgun" sayılır (ms). */
const SSE_STALE_AFTER_MS = 15 * 60 * 1000; // 15 dk

/** Mongoose bağlantı durum kodunu okunabilir metne çevirir. */
function readMongoStatus() {
  const state = mongoose.connection.readyState;
  return state === 1 ? 'connected' : state === 2 ? 'connecting' : 'disconnected';
}

/**
 * İsteğin proxy zincirinden nasıl göründüğünü raporlar.
 *
 * NEDEN: `trust proxy` ayarının DEĞERİNİ bilmek, doğru ÇALIŞTIĞINI kanıtlamaz.
 * Render'da 10 Eylül 2026'da gerçek ölçümle görüldü ki sabit hop sayısı (`1`)
 * ile tek bir istemci sunucu tarafında ÜÇ farklı IP olarak görülebiliyordu —
 * XFF zincirinin uzunluğu her istekte aynı olmadığı için sağdan n. eleman
 * kayıyordu. Sonuç: IP bazlı rate limit ~3 kat gevşek çalışıyordu.
 *
 * Bu blok, o sınıf arızayı dışarıdan tek bir `curl` ile teşhis edilebilir kılar.
 *
 * GİZLİLİK: İstemci burada yalnızca KENDİ adresini görür; başka kullanıcıya ait
 * hiçbir veri sızmaz.
 *
 * @param {import('express').Request} req
 * @returns {object}
 */
function describeProxy(req) {
  const resolvedClientIp = req.ip ?? null;

  // Gerçek bir istemci internet üzerinden ÖZEL bir adresle gelemez. Çözülen
  // adres özel/loopback ise `trust proxy` neredeyse kesin olarak yanlıştır ve
  // limitler "IP başına" değil fiilen "küresel" sayıyordur.
  const misconfigured = isPrivateOrLoopbackIp(resolvedClientIp);

  return {
    // Yapılandırılan değer (config'ten)
    trustProxyHops: config.trustProxyHops,
    // Express'in bu değere göre ÇÖZDÜĞÜ istemci adresi — rate limit anahtarı budur.
    resolvedClientIp,
    // 🔴 true ise rate limiting SESSİZCE bozuktur — TRUST_PROXY_HOPS düzeltilmeli.
    looksMisconfigured: misconfigured,
    hint: misconfigured
      ? 'resolvedClientIp özel/iç bir adres — TRUST_PROXY_HOPS yanlış. ' +
        'rawForwardedFor zincirinde gerçek istemci soldan 1., altyapı hop sayısı ' +
        'ise sağdaki eleman sayısıdır; TRUST_PROXY_HOPS o sayıya eşit olmalıdır.'
      : null,
    // Express'in güvenilir kabul ettiği zincir.
    forwardedChain: Array.isArray(req.ips) ? req.ips : [],
    // Ham başlık — zincirin gerçek şekli ve uzunluğu buradan görülür.
    rawForwardedFor: req.get('x-forwarded-for') ?? null,
    // Soket seviyesindeki karşı taraf (proxy'nin kendisi olmalı).
    socketRemoteAddress: req.socket?.remoteAddress ?? null,
  };
}

/**
 * Sistemin anlık durumunu toplar.
 *
 * @returns {{healthy: boolean, payload: object}} `healthy`, readiness kararı içindir.
 */
function collectStatus(req) {
  const mongodb = readMongoStatus();
  const sse = getSSEStatus();

  // Durgunluk yalnızca akış BAŞLATILMIŞSA ve daha önce en az bir mesaj
  // görülmüşse anlamlıdır — sessiz bir gecede hiç işlem olmaması normaldir,
  // bu yüzden "hiç mesaj gelmedi" tek başına arıza sayılmaz.
  const lastMs = sse.lastMessageAt ? Date.parse(sse.lastMessageAt) : null;
  const sseStale = Boolean(lastMs && Date.now() - lastMs > SSE_STALE_AFTER_MS);

  const payload = {
    status: 'ok',
    service: 'kalem-orchestrator',
    environment: config.nodeEnv,
    network: config.stellar.network,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    dependencies: {
      mongodb,
      stellar: {
        horizonUrl: config.stellar.horizonUrl,
        sorobanRpcUrl: config.stellar.sorobanRpcUrl,
        // Horizon'a canlı istek ATILMAZ: bu uç dakikada bir çağrılabilir ve her
        // çağrıda dış ağa gitmek gereksiz yük/başarısızlık kaynağı olurdu.
        // Horizon'un gerçek canlılık sinyali zaten aşağıdaki SSE akışıdır.
        sseListener: {
          started: sse.started,
          startedAt: sse.startedAt,
          lastMessageAt: sse.lastMessageAt,
          messageCount: sse.messageCount,
          lastError: sse.lastError,
          lastErrorAt: sse.lastErrorAt,
          stale: sseStale,
        },
      },
    },
    // Rate limiting'in IP katmanının doğruluğu buna bağlıdır; deploy sonrası
    // gözle doğrulanabilsin diye raporlanır (bkz. §6.2.1 trust proxy uyarısı).
    trustProxyHops: config.trustProxyHops,
    proxy: describeProxy(req),
  };

  const healthy = mongodb === 'connected' && sse.started && !sseStale;
  return { healthy, payload };
}

/**
 * GET /api/v1/health — liveness. Her zaman 200.
 */
router.get('/', (req, res) => {
  const { payload } = collectStatus(req);
  res.status(200).json(payload);
});

/**
 * GET /api/v1/health/ready — readiness. Bağımlılık bozuksa 503.
 */
router.get('/ready', (req, res) => {
  const { healthy, payload } = collectStatus(req);
  res.status(healthy ? 200 : 503).json({ ...payload, status: healthy ? 'ready' : 'not_ready' });
});

export default router;
