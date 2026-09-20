/**
 * Rate Limiting (İstek Sıklığı Sınırı) Middleware
 *
 * Bölüm 6.2'de belgelenen açığı kapatır: `/transactions/submit` iki yollu
 * kimlik doğrulamasına geçtikten sonra (bkz. `auth.middleware.js` →
 * `submitAuthMiddleware`), bu uca **kayıt gerektirmeyen, bedava üretilebilen
 * herhangi bir Ed25519 anahtar çifti** (`Keypair.random()`) istediği sıklıkta
 * istek gönderebilir hale geldi. Aynı durum kimliksiz `/faucet/mint`,
 * `/merchants/register` ve GİB belge okuma uçları için de geçerlidir.
 *
 * ## Korunan gerçek maliyet
 *
 * Kimliksiz tek bir `/transactions/submit` isteği, reddedilse bile şunları
 * harcar (sırayla):
 *   1. `idempotencyMiddleware` → `acquireIdempotencyLock()` — **MongoDB yazma**
 *      (`writeConcern: majority`), kayıt `failed` olarak KALIR, silinmez.
 *   2. `submitTransactionHandler` → `Transaction.create()` — **ikinci MongoDB yazma**,
 *      bu da kalıcıdır.
 *   3. `wrapAndSubmitFeeBump` → `simulateInnerTransaction()` — **Soroban RPC çağrısı**.
 *   4. Zarf geçerliyse `submitTransaction()` — Horizon + **gerçek Havuz 2 XLM**.
 *
 * Yani risk yalnızca RPC tüketimi değil; her başarısız istek Atlas'ta iki kalıcı
 * kayıt bırakır ve depolama kotasını doldurabilir.
 *
 * ## Neden İKİ katman (IP + kimlik)
 *
 * - **IP tek başına yetmez:** TEKNOFEST standında müşteri ve esnaf cihazları
 *   aynı NAT arkasındadır — hepsi tek IP olarak görünür, meşru kullanıcılar
 *   birbirinin sayacını tüketir.
 * - **Kimlik tek başına yetmez:** Stellar adresi bedava üretilir; saldırgan her
 *   istekte yeni bir `Keypair.random()` ile adres bazlı limiti atlar.
 *
 * İkisi birlikte her iki boşluğu da kapatır.
 *
 * ## Yerleşim (route dosyalarında)
 *
 * ```
 * submitIpRateLimiter          <- pozisyon 0, hiçbir parse/DB yok
 * validateTransactionSubmit
 * submitAuthMiddleware         <- req.senderAddress / req.merchantId burada set edilir
 * submitIdentityRateLimiter    <- İLK DB YAZMASINDAN ÖNCE
 * idempotencyMiddleware        <- ilk MongoDB yazması
 * submitTransactionHandler     <- DB + Soroban RPC + Horizon
 * ```
 *
 * Kimlik limiti neden en başta değil: kimlik bazlı anahtar için `signedXdr`'ın
 * parse edilmesi gerekir ve `submitAuthMiddleware` bunu ZATEN yapar. En başa
 * koymak aynı XDR'ı iki kez parse etmek olurdu — saldırganın değil bizim
 * maliyetimizi artırırdı. Bu yerleşimde hiçbir istek, bir limitten geçmeden
 * herhangi bir DB yazmasına veya RPC çağrısına ulaşamaz.
 *
 * ## Store: bellek-içi (MemoryStore), bilinçli tercih
 *
 * MongoDB destekli bir store her istekte bir DB yazması yapardı — tam olarak
 * engellemeye çalıştığımız şey. Bedeli: sayaçlar sunucu restart'ında sıfırlanır
 * ve çok-instance'lı dağıtımda instance'lar arası paylaşılmaz. Tek instance'lı
 * demo dağıtımı için kabul edilebilir; bkz. §6.2.
 *
 * ## `trust proxy` UYARISI
 *
 * IP bazlı katman `req.ip`'ye dayanır. Bulut host'ta (Render/Railway) uygulama
 * reverse proxy arkasındadır ve `config.trustProxyHops` doğru ayarlanmazsa
 * `req.ip` HERKES için proxy'nin IP'si olur → tüm kullanıcılar tek sayacı
 * paylaşıp topluca kilitlenir. Bkz. `src/index.js` ve `config/index.js`.
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { isPrivateOrLoopbackIp } from '../../utils/net.js';

/**
 * Limit aşıldığında dönen gövde — kod tabanının her yerindeki hata şekliyle
 * aynı (`{ error, message }`), mesaj Türkçe.
 */
const RATE_LIMITED_BODY = {
  error: 'RATE_LIMITED',
  message: 'Çok fazla istek gönderildi, lütfen biraz bekleyip tekrar deneyin.',
};

/**
 * Tüm limiter'lar için ortak fabrika.
 *
 * @param {object} params
 * @param {string} params.name - Log etiketi (ör. 'submit:ip').
 * @param {{windowMs: number, max: number}} params.limits - config.rateLimit.* girdisi.
 * @param {(req: import('express').Request) => string} params.keyGenerator - Sayaç anahtarı.
 * @returns {import('express').RequestHandler}
 */
function createLimiter({ name, limits, keyGenerator }) {
  // Genel kapatma anahtarı: limiter yerine hiçbir şey yapmayan bir middleware döner.
  // (Yalnızca yerel hata ayıklama içindir — demo/prod'da RATE_LIMIT_ENABLED=true olmalı.)
  if (!config.rateLimit.enabled) {
    return (req, res, next) => next();
  }

  return rateLimit({
    windowMs: limits.windowMs,
    limit: limits.max,
    standardHeaders: true, // RateLimit-* başlıkları (RFC taslağı)
    legacyHeaders: false, // X-RateLimit-* kapalı
    keyGenerator,
    handler: (req, res) => {
      logger.warn(
        `[RateLimit] Limit aşıldı (${name}) — anahtar: ${keyGenerator(req)}, ` +
          `yol: ${req.method} ${req.originalUrl}`
      );
      res.status(429).json(RATE_LIMITED_BODY);
    },
  });
}

/** `trust proxy` yanlış yapılandırma uyarısı süreç başına bir kez loglanır. */
let misconfigWarned = false;

/**
 * IP anahtarı. `ipKeyGenerator`, IPv6 adreslerini /64 alt ağına indirger —
 * aksi halde tek bir IPv6 tahsisi sahibi, her istekte farklı adres kullanarak
 * limiti sınırsız atlayabilirdi (express-rate-limit v7+ bunu zorunlu kılar).
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function ipKey(req) {
  const ip = req.ip ?? '';

  // Çözülen adres özel/iç bir adresse `trust proxy` yanlıştır: o adres TÜM
  // kullanıcılarda ortak olduğu için limitler "IP başına" değil fiilen
  // "küresel" sayar ve birkaç kullanıcı herkesi kilitleyebilir. Sessizce
  // bozulmasın diye SÜREÇ BAŞINA BİR KEZ uyarı loglanır (her istekte loglamak
  // gürültü yaratırdı). Ayrıntı: utils/net.js ve §6.2.1.
  if (!misconfigWarned && isPrivateOrLoopbackIp(ip)) {
    misconfigWarned = true;
    logger.warn(
      `[RateLimit] UYARI: rate limit anahtarı özel/iç bir adrese çözülüyor (${ip}). ` +
        `TRUST_PROXY_HOPS (şu an ${config.trustProxyHops}) muhtemelen yanlış — ` +
        `limitler IP başına değil KÜRESEL sayıyor olabilir. ` +
        `Teşhis: GET /api/v1/health -> proxy.rawForwardedFor`
    );
  }

  return ipKeyGenerator(ip);
}

/**
 * `POST /transactions/submit` — IP bazlı kaba katman.
 * Zincirin EN BAŞINA bağlanır: hiçbir parse, hiçbir DB erişimi yapılmadan önce.
 */
export const submitIpRateLimiter = createLimiter({
  name: 'submit:ip',
  limits: config.rateLimit.submitIp,
  keyGenerator: ipKey,
});

/**
 * `POST /transactions/submit` — kimlik bazlı katman.
 *
 * `submitAuthMiddleware`'DEN SONRA, `idempotencyMiddleware`'DEN ÖNCE bağlanır.
 * Anahtar önceliği:
 *   1. `req.senderAddress` — müşteri yolu (imzalı XDR'ın kaynak hesabı)
 *   2. `req.merchantId`    — esnaf yolu (Bearer API anahtarı)
 *   3. IP                  — ikisi de yoksa (savunma amaçlı yedek; normal
 *                            akışta `submitAuthMiddleware` bu duruma izin vermez)
 */
export const submitIdentityRateLimiter = createLimiter({
  name: 'submit:identity',
  limits: config.rateLimit.submitIdentity,
  keyGenerator: (req) => {
    if (req.senderAddress) return `addr:${req.senderAddress}`;
    if (req.merchantId) return `merchant:${req.merchantId}`;
    return `ip:${ipKey(req)}`;
  },
});

/**
 * `POST /faucet/mint` — adres bazlı, en sıkı limit.
 *
 * Bu uç gerçekten para basar: her çağrı `ISSUER_SECRET_KEY` imzalı gerçek bir
 * mint işlemi tetikler, ihraççının XLM'ini harcar ve dTL arzını şişirir
 * (bkz. §6.7). Route handler'ından ÖNCE çalışır; gövde henüz doğrulanmadığı
 * için `address` alanı güvenilmez kabul edilir ve yalnızca sayaç anahtarı
 * olarak kullanılır — geçerlilik kontrolü handler'da yapılır.
 */
export const faucetAddressRateLimiter = createLimiter({
  name: 'faucet:address',
  limits: config.rateLimit.faucetAddress,
  keyGenerator: (req) => {
    const address = req.body?.address;
    return typeof address === 'string' && address ? `addr:${address}` : `ip:${ipKey(req)}`;
  },
});

/**
 * `POST /faucet/mint` — IP bazlı katman.
 * Adres bedava üretilebildiği için adres limitinin tek başına atlanabildiği
 * boşluğu kapatır.
 */
export const faucetIpRateLimiter = createLimiter({
  name: 'faucet:ip',
  limits: config.rateLimit.faucetIp,
  keyGenerator: ipKey,
});

/**
 * `POST /merchants/register` — IP bazlı.
 *
 * Bu uçta kimlik doğrulama YOKTUR ve her başarılı istek kalıcı bir `Merchant`
 * kaydı yazar; `/transactions/submit` ile aynı sınıf açıktır (bedava anahtar →
 * kalıcı DB yazması). Adres bazlı anahtarlamanın burada faydası yoktur, çünkü
 * saldırgan her kayıt için zaten yeni bir adres üretir.
 */
export const merchantRegisterRateLimiter = createLimiter({
  name: 'merchant:register',
  limits: config.rateLimit.merchantRegister,
  keyGenerator: ipKey,
});

/**
 * `GET /transactions/:txHash/gib-document` — IP bazlı.
 * Kimliksiz bir okuma ucudur; yazma yapmadığı için limit diğerlerinden gevşektir,
 * amaç yalnızca toplu tarama/kazıma (scraping) hızını sınırlamaktır.
 */
export const gibReadRateLimiter = createLimiter({
  name: 'gib:read',
  limits: config.rateLimit.gibRead,
  keyGenerator: ipKey,
});

/**
 * `GET /merchants/:id/dashboard` ve `/transactions` — IP bazlı.
 * Bearer'lı okuma uçları; Mongo sorgusu yaptıkları için (Atlas ayrı bölgede) toplu
 * çağrıya karşı bir tavan konur. Ana ekran birkaç çağrıyla açıldığı için 60/dk rahattır.
 */
export const merchantReadRateLimiter = createLimiter({
  name: 'merchant:read',
  limits: config.rateLimit.merchantRead,
  keyGenerator: ipKey,
});

/**
 * `GET /merchants/:id/reports/daily` — IP bazlı. Bir günün tüm belgelerini derler;
 * en ağır okuma ucudur, bu yüzden dakikada 10.
 */
export const merchantReportRateLimiter = createLimiter({
  name: 'merchant:report',
  limits: config.rateLimit.merchantReport,
  keyGenerator: ipKey,
});

/**
 * `GET /flow/latest` ve `GET /flow/stream` — IP bazlı.
 * Token'lı okuma uçlarıdır; limit, token sızsa bile toplu sorgu/bağlantı
 * açma hızını sınırlar. EventSource koptuğunda birkaç saniyede bir yeniden
 * bağlandığı için dakikada 60 meşru kullanımı rahat karşılar.
 */
export const flowReadRateLimiter = createLimiter({
  name: 'flow:read',
  limits: config.rateLimit.flowRead,
  keyGenerator: ipKey,
});
