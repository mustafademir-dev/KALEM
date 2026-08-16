/**
 * Cüzdan Servisi (Wallet Service)
 *
 * Bölüm 5.6.1: Kısmi Non-Custodial anahtar yönetimi.
 *
 * - Ed25519 keypair üretimi ve Expo SecureStore'da saklama
 * - tweetnacl-js ile yazılımsal imzalama
 * - PoC fazında Secure Enclave/TEE yerine SecureStore kullanılır
 *   (Ed25519 ↔ NIST P-256 uyumsuzluğu nedeniyle)
 *
 * Not (web hedefi): depolama katmanı (native SecureStore / web localStorage
 * ayrımı) `utils/storage.js`'te ortak — bkz. o dosyanın dokümantasyonu ve
 * docs/ARCHITECTURE_DECISIONS.md §6.5.
 */

import nacl from 'tweetnacl';
import * as StellarSdk from '@stellar/stellar-sdk';
import { WALLET_SECRET_STORAGE_KEY } from '../utils/constants.js';
import storage, { bytesToBase64, base64ToBytes } from '../utils/storage.js';

export { bytesToBase64 };

function addressFromPublicKey(publicKeyBytes) {
  return StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(publicKeyBytes));
}

/**
 * Yeni Ed25519 keypair oluşturur ve SecureStore'a kaydeder.
 * Zaten bir cüzdan varsa ÜZERİNE YAZMAZ — önce loadWallet() ile kontrol edilmelidir.
 *
 * @returns {Promise<{publicKey: string, stellarAddress: string}>}
 */
export async function createWallet() {
  const keyPair = nacl.sign.keyPair();
  await storage.setItemAsync(WALLET_SECRET_STORAGE_KEY, bytesToBase64(keyPair.secretKey));

  return {
    publicKey: bytesToBase64(keyPair.publicKey),
    stellarAddress: addressFromPublicKey(keyPair.publicKey),
  };
}

/**
 * SecureStore'dan mevcut cüzdanı yükler.
 *
 * @returns {Promise<{publicKey: string, stellarAddress: string} | null>}
 */
export async function loadWallet() {
  const storedSecret = await storage.getItemAsync(WALLET_SECRET_STORAGE_KEY);
  if (!storedSecret) return null;

  const secretKey = base64ToBytes(storedSecret);
  const publicKey = secretKey.slice(32, 64); // tweetnacl secretKey formatı: seed(32) + publicKey(32)

  return {
    publicKey: bytesToBase64(publicKey),
    stellarAddress: addressFromPublicKey(publicKey),
  };
}

/**
 * Cüzdanı SecureStore'dan tamamen siler (yalnızca test/demo sıfırlama amaçlı).
 */
export async function deleteWallet() {
  await storage.deleteItemAsync(WALLET_SECRET_STORAGE_KEY);
}

/**
 * Verilen veriyi Ed25519 ile imzalar.
 *
 * @param {Uint8Array} data - İmzalanacak veri (ör. Stellar tx hash).
 * @returns {Promise<Uint8Array>} 64 baytlık Ed25519 imzası.
 */
export async function signData(data) {
  const storedSecret = await storage.getItemAsync(WALLET_SECRET_STORAGE_KEY);
  if (!storedSecret) {
    throw new Error('Cüzdan bulunamadı — önce createWallet() çağrılmalı.');
  }
  const secretKey = base64ToBytes(storedSecret);
  return nacl.sign.detached(data, secretKey);
}
