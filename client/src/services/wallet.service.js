/**
 * Cüzdan Servisi (Wallet Service)
 *
 * Bölüm 5.6.1: Kısmi Non-Custodial anahtar yönetimi.
 *
 * - Ed25519 keypair üretimi ve Expo SecureStore'da saklama
 * - tweetnacl-js ile yazılımsal imzalama
 * - PoC fazında Secure Enclave/TEE yerine SecureStore kullanılır
 *   (Ed25519 ↔ NIST P-256 uyumsuzluğu nedeniyle)
 */

/**
 * Yeni Ed25519 keypair oluşturur ve SecureStore'a kaydeder.
 *
 * @returns {Promise<{publicKey: string, stellarAddress: string}>}
 */
export async function createWallet() {
  // TODO: Faz 3 Aşama 3.2'de implemente edilecek.
  // 1. tweetnacl.sign.keyPair() ile Ed25519 keypair üret
  // 2. SecureStore.setItemAsync('wallet_secret', base64Encode(secretKey))
  // 3. Stellar public key (G... adresi) türet
  // 4. { publicKey, stellarAddress } döndür
  throw new Error('NOT_IMPLEMENTED');
}

/**
 * SecureStore'dan mevcut cüzdanı yükler.
 *
 * @returns {Promise<{publicKey: string, stellarAddress: string} | null>}
 */
export async function loadWallet() {
  // TODO: Faz 3 Aşama 3.2'de implemente edilecek.
  throw new Error('NOT_IMPLEMENTED');
}

/**
 * Verilen veriyi Ed25519 ile imzalar.
 *
 * @param {Uint8Array} data - İmzalanacak veri (XDR hash).
 * @returns {Promise<Uint8Array>} Ed25519 imzası.
 */
export async function signData(data) {
  // TODO: Faz 3 Aşama 3.2'de implemente edilecek.
  // 1. SecureStore'dan secret key oku
  // 2. tweetnacl.sign.detached(data, secretKey) ile imzala
  // 3. İmzayı döndür
  throw new Error('NOT_IMPLEMENTED');
}
