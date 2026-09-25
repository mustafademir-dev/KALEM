/**
 * Merkezi konfigürasyon modülü.
 *
 * Tüm ortam değişkenlerini tek noktadan okur, doğrular ve dışa aktarır.
 * Eksik zorunlu değişken varsa sunucu başlatılmaz.
 */

import 'dotenv/config';

/**
 * @param {string} key - Ortam değişkeni adı.
 * @param {string} [fallback] - Varsayılan değer (opsiyonel).
 * @returns {string}
 */
function requireEnv(key, fallback) {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`[Config] Zorunlu ortam değişkeni eksik: ${key}`);
  }
  return value;
}

const config = {
  // --- Sunucu ---
  port: parseInt(requireEnv('PORT', '3000'), 10),
  nodeEnv: requireEnv('NODE_ENV', 'development'),

  /**
   * Express `trust proxy` ayarı — güvenilen reverse proxy "hop" sayısı.
   *
   * Rate limiting'in IP bazlı katmanı `req.ip`'ye dayanır ve bu değer YANLIŞSA
   * iki yönde de kırılır (bkz. docs/ARCHITECTURE_DECISIONS.md §6.2):
   * - Çok DÜŞÜK (bulut host'ta 0): `req.ip` herkes için proxy'nin IP'si olur,
   *   tüm kullanıcılar tek sayacı paylaşır ve topluca kilitlenir.
   * - Çok YÜKSEK / `true`: saldırgan `X-Forwarded-For` uydurup limiti atlar.
   *
   * Yerelde (proxy yok) `0`; **Render'da `3`** — canlı ölçümle bulundu, tahmin
   * DEĞİLDİR (§6.2.2). Express soket bağlantısını da hop sayar, Render'da zincir:
   * `::1` (soket) → `10.x` (Render iç LB) → Cloudflare → gerçek istemci.
   * İlk denenen `1`, `req.ip`'yi Render'ın İÇ adresine çözüyordu; o adres tüm
   * kullanıcılarda ortak olduğu için limitler fiilen KÜRESEL sayıyordu.
   * Değer platforma özgüdür: yeni bir host'a taşınırsa YENİDEN ÖLÇÜLMELİDİR
   * (`GET /api/v1/health` → `proxy.looksMisconfigured` false olmalı).
   */
  trustProxyHops: parseInt(requireEnv('TRUST_PROXY_HOPS', '0'), 10),

  // --- MongoDB ---
  mongodbUri: requireEnv('MONGODB_URI', 'mongodb://localhost:27017/kalem'),

  // --- Stellar ---
  stellar: {
    network: requireEnv('STELLAR_NETWORK', 'testnet'),
    horizonUrl: requireEnv('HORIZON_URL', 'https://horizon-testnet.stellar.org'),
    sorobanRpcUrl: requireEnv('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org'),
  },

  // --- Kontrat ID'leri ---
  contracts: {
    dtlTokenId: requireEnv('DTL_TOKEN_CONTRACT_ID', ''),
    poolManagerId: requireEnv('POOL_MANAGER_CONTRACT_ID', ''),
  },

  // --- Havuz Adresleri ---
  pools: {
    pool1Address: requireEnv('POOL1_ADDRESS', ''),
    pool2Address: requireEnv('POOL2_ADDRESS', ''),   // Klasik G... adresi
    pool3Address: requireEnv('POOL3_ADDRESS', ''),
    pool4Address: requireEnv('POOL4_ADDRESS', ''),
  },

  // --- Gizli Anahtarlar (ÜRETİMDE HSM) ---
  secrets: {
    pool2SecretKey: requireEnv('POOL2_SECRET_KEY', ''),
    issuerSecretKey: requireEnv('ISSUER_SECRET_KEY', ''),
    // Müşteri TC kimlik numarasının HMAC özeti için sunucu gizli anahtarı
    // (bkz. utils/credentials.js). TC açık hâlde saklanmaz.
    customerIdHashSecret: requireEnv('CUSTOMER_ID_HASH_SECRET', ''),
  },

  // --- Şifreleme ---
  aesEncryptionKey: requireEnv('AES_ENCRYPTION_KEY', ''),

  // --- Demo Musluk (Faucet) — YALNIZCA testnet, bkz. faucet.routes.js ---
  faucet: {
    // Her istekte mint edilecek sabit tutar (stroop). Client TUTAR BELİRLEYEMEZ —
    // bilinçli bir tasarım kararı, isteğe bağlı miktar demo musluğunu
    // sınırsız bir para basma ucuna çevirirdi.
    mintAmountStroops: requireEnv('FAUCET_MINT_AMOUNT_STROOPS', '100000000'), // 10 dTL
  },

  // --- CORS ---
  // Geliştirmede herhangi bir localhost portu (Expo web dev sunucusu her
  // başlatmada farklı porta düşebilir) daima izinlidir — bkz. index.js.
  // Prod/demo sunucu adresi netleşince BURAYA (virgülle ayrılmış, tam
  // origin listesi) eklenmelidir (bkz. ARCHITECTURE_DECISIONS.md §6.6).
  corsAllowedOrigins: requireEnv('CORS_ALLOWED_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // --- Havuz 2 Besleme ---
  pool2XlmThreshold: parseFloat(requireEnv('POOL2_XLM_THRESHOLD', '10')),

  // --- Demo Modu (TEKNOFEST sunumu için) ---
  // false: gerçekçi/üretim davranışı (manuel onay kuyrukları).
  // true: sabit demo kurlarıyla otomatik, kesintisiz akış.
  demoMode: requireEnv('DEMO_MODE', 'false') === 'true',

  // --- Fee-Bump (Dış Zarf) Ayarları ---
  feeBump: {
    // İç zarfın inclusion fee'sine uygulanan marj katsayısı (surge pricing tamponu).
    baseFeeMultiplier: parseInt(requireEnv('FEE_BUMP_BASE_FEE_MULTIPLIER', '2'), 10),
    // baseFee için üst sınır (stroops, string — BigInt dönüşümü kullanım yerinde).
    maxBaseFeeStroops: requireEnv('FEE_BUMP_MAX_BASE_FEE_STROOPS', '100000'),
    // Dış zarfın TOPLAM ücreti için mutlak tavan (stroops). SDK resourceFee'yi
    // koşulsuz eklediği için tek gerçek üst sınır budur.
    maxTotalFeeStroops: requireEnv('FEE_BUMP_MAX_TOTAL_FEE_STROOPS', '10000000'),
    // İç zarfta izin verilen maksimum operasyon sayısı.
    maxInnerOperations: parseInt(requireEnv('FEE_BUMP_MAX_INNER_OPERATIONS', '1'), 10),
    // Sponsorlanabilecek kontrat ID'leri (virgülle ayrılmış). Boşsa aşağıda
    // dtlTokenId + poolManagerId ile doldurulur.
    allowedContractIds: requireEnv('FEE_BUMP_ALLOWED_CONTRACT_IDS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // İç zarfın sonlu bir maxTime (timebounds) taşımasını zorunlu kılar.
    requireTimeBounds: requireEnv('FEE_BUMP_REQUIRE_TIMEBOUNDS', 'false') === 'true',
  },

  /**
   * --- Rate Limiting (İstek Sıklığı Sınırı) Ayarları ---
   *
   * Tüm değerler env'den okunur; amaç, sunum öncesinde kod değiştirmeden
   * gevşetilebilmeleridir (bkz. docs/ARCHITECTURE_DECISIONS.md §6.2).
   * `windowMs` pencere uzunluğu (ms), `max` o pencerede izin verilen istek sayısı.
   */
  rateLimit: {
    // Genel anahtar: false yapılırsa TÜM limiter'lar devre dışı kalır.
    // Yalnızca yerel geliştirme/hata ayıklama içindir — demo/prod'da ASLA false olmamalı.
    enabled: requireEnv('RATE_LIMIT_ENABLED', 'true') === 'true',

    // POST /transactions/submit — IP bazlı (kaba katman, zincirin en başında).
    submitIp: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_SUBMIT_IP_WINDOW_MS', '300000'), 10), // 5 dk
      max: parseInt(requireEnv('RATE_LIMIT_SUBMIT_IP_MAX', '30'), 10),
    },
    // POST /transactions/submit — kimlik bazlı (gönderen Stellar adresi ya da esnaf).
    // IP limitinin NAT boşluğunu kapatır: aynı standda herkes tek IP'den gelir.
    submitIdentity: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_SUBMIT_IDENTITY_WINDOW_MS', '60000'), 10), // 1 dk
      max: parseInt(requireEnv('RATE_LIMIT_SUBMIT_IDENTITY_MAX', '10'), 10),
    },
    // POST /faucet/mint — adres bazlı. En sıkı limit: bu uç gerçekten para basıyor.
    faucetAddress: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_FAUCET_ADDRESS_WINDOW_MS', '3600000'), 10), // 1 saat
      max: parseInt(requireEnv('RATE_LIMIT_FAUCET_ADDRESS_MAX', '5'), 10),
    },
    // POST /faucet/mint — IP bazlı (bedava üretilen adreslerle limit atlamayı sınırlar).
    faucetIp: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_FAUCET_IP_WINDOW_MS', '3600000'), 10), // 1 saat
      max: parseInt(requireEnv('RATE_LIMIT_FAUCET_IP_MAX', '15'), 10),
    },
    // POST /merchants/register — kimliksiz, her istek kalıcı bir Merchant kaydı yazar.
    // Esnaf (VKN+şifre) ve müşteri (TC+PIN) girişi/kaydı — IP bazlı.
    // Hesap bazlı deneme kilidi ayrıca vardır (5 hatada 15 dk, utils/credentials.js).
    accountAuth: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_ACCOUNT_AUTH_WINDOW_MS', '900000'), 10), // 15 dk
      max: parseInt(requireEnv('RATE_LIMIT_ACCOUNT_AUTH_MAX', '30'), 10),
    },
    merchantRegister: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_MERCHANT_REGISTER_WINDOW_MS', '3600000'), 10), // 1 saat
      max: parseInt(requireEnv('RATE_LIMIT_MERCHANT_REGISTER_MAX', '10'), 10),
    },
    // GET /transactions/:txHash/gib-document — kimliksiz okuma ucu.
    gibRead: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_GIB_READ_WINDOW_MS', '60000'), 10), // 1 dk
      max: parseInt(requireEnv('RATE_LIMIT_GIB_READ_MAX', '60'), 10),
    },
    // GET /merchants/:id/dashboard ve /transactions — esnaf okuma uçları (Bearer'lı).
    merchantRead: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_MERCHANT_READ_WINDOW_MS', '60000'), 10), // 1 dk
      max: parseInt(requireEnv('RATE_LIMIT_MERCHANT_READ_MAX', '60'), 10),
    },
    // GET /merchants/:id/reports/daily — gün sonu CSV (ağır sorgu, daha sıkı).
    merchantReport: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_MERCHANT_REPORT_WINDOW_MS', '60000'), 10), // 1 dk
      max: parseInt(requireEnv('RATE_LIMIT_MERCHANT_REPORT_MAX', '10'), 10),
    },
    // GET /flow/latest ve /flow/stream — panel okuma uçları (token'lı).
    flowRead: {
      windowMs: parseInt(requireEnv('RATE_LIMIT_FLOW_READ_WINDOW_MS', '60000'), 10), // 1 dk
      max: parseInt(requireEnv('RATE_LIMIT_FLOW_READ_MAX', '60'), 10),
    },
  },

  /**
   * --- Mutabakat (Reconciliation) Ayarları ---
   *
   * SSE dinleyicisinin yedeği (§6.4). `submitted` durumunda takılı kalan
   * işlemleri periyodik olarak Horizon'dan doğrular. Canlı Render dağıtımında
   * SSE'nin hiç mesaj almadığı GERÇEK bir arızayla gerekliliği kanıtlandı.
   */
  reconciliation: {
    enabled: requireEnv('RECONCILIATION_ENABLED', 'true') === 'true',
    // Varsayılan: dakikada bir. Demo sırasında GİB fişinin makul sürede
    // görünmesi için sık, Horizon'u yormayacak kadar seyrek.
    // node-cron 6 alanlı (saniyeli) ifadeyi de kabul eder: Render'da
    // "*/10 * * * * *" (10 sn) — canlı işlem akışının 7. adımı için.
    cronExpression: requireEnv('RECONCILIATION_CRON', '* * * * *'),
    // Bu yaştan genç 'submitted' işlemler atlanır (önce SSE'ye şans verilir).
    minAgeMs: parseInt(requireEnv('RECONCILIATION_MIN_AGE_MS', '20000'), 10),
  },

  /**
   * --- Canlı İşlem Akışı Paneli (`/flow`) ---
   *
   * Panelin veri uçları (`/api/v1/flow/*`) bu token olmadan çalışmaz. Boşsa
   * panel tamamen KAPALIDIR (503). EventSource başlık gönderemediği için token
   * `?token=` sorgu parametresiyle gelir — gizli bir sır değil, demo panelini
   * rastgele tarayıcılardan ayıran bir bariyerdir (gösterilen veriler zaten
   * zincirde herkese açık: hash, adres, tutar; ek olarak işletme adı).
   */
  flowPanel: {
    token: requireEnv('FLOW_PANEL_TOKEN', ''),
    // Aynı anda açık tutulabilecek canlı yayın bağlantısı sayısı.
    maxStreams: parseInt(requireEnv('FLOW_PANEL_MAX_STREAMS', '20'), 10),
  },

  // --- Havuz 4 → Havuz 2 Besleme (Pool Feeder) Ayarları ---
  poolFeeder: {
    cronExpression: requireEnv('POOL_FEEDER_CRON', '*/5 * * * *'),
    // true: Havuz 2 bakiyesi minimum rezerv/liabilities düşülerek (harcanabilir) hesaplanır.
    useSpendableBalance: requireEnv('POOL_FEEDER_USE_SPENDABLE_BALANCE', 'true') === 'true',
    // Bu tutarın altındaki Havuz 4 bakiyeleri için besleme döngüsü tetiklenmez (stroops).
    minBurnStroops: requireEnv('POOL_FEEDER_MIN_BURN_STROOPS', '10000000'),
    // Tek bir döngüde en fazla yakılacak tutar (stroops).
    maxBurnStroops: requireEnv('POOL_FEEDER_MAX_BURN_STROOPS', '1000000000'),
    // DEMO_MODE=true iken kullanılan sabit dTL/XLM kuru. DEMO_MODE=false iken anlamsız.
    demoDtlPerXlm: requireEnv('POOL_FEEDER_DEMO_DTL_PER_XLM', '') || null,
  },
};

// allowedContractIds boşsa (env tanımsızsa) KALEM'in kendi kontratlarıyla doldur.
if (config.feeBump.allowedContractIds.length === 0) {
  config.feeBump.allowedContractIds = [config.contracts.dtlTokenId, config.contracts.poolManagerId].filter(
    Boolean
  );
}

export default config;
