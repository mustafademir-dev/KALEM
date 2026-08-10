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
  mongodbUri: requireEnv('MONGODB_URI'),

  // --- Stellar ---
  stellar: {
    network: requireEnv('STELLAR_NETWORK', 'testnet'),
    horizonUrl: requireEnv('HORIZON_URL'),
    sorobanRpcUrl: requireEnv('SOROBAN_RPC_URL'),
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
};

export default config;
