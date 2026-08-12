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
  },

  // --- Şifreleme ---
  aesEncryptionKey: requireEnv('AES_ENCRYPTION_KEY', ''),

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
