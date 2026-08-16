/**
 * AES-256 Şifreleme Yardımcıları
 *
 * Bölüm 5.6.2: MongoDB üzerinde saklanan mali verilerin
 * AES-256 standardıyla şifrelenmesi. Simetrik anahtarlar
 * sunucu kodundan izole yapılandırmalarda tutulur.
 */

import crypto from 'node:crypto';
import config from '../config/index.js';
import logger from './logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Veriyi AES-256-GCM ile şifreler.
 *
 * @param {string} plaintext - Şifrelenecek metin.
 * @returns {string} IV + AuthTag + CipherText (Base64).
 */
export function encrypt(plaintext) {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  //
  // const iv = crypto.randomBytes(IV_LENGTH);
  // const key = Buffer.from(config.aesEncryptionKey, 'hex');
  // const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  // let encrypted = cipher.update(plaintext, 'utf8');
  // encrypted = Buffer.concat([encrypted, cipher.final()]);
  // const authTag = cipher.getAuthTag();
  // return Buffer.concat([iv, authTag, encrypted]).toString('base64');

  logger.warn('[Crypto] encrypt() henüz implemente edilmedi.');
  return plaintext;
}

/**
 * AES-256-GCM ile şifrelenmiş veriyi çözer.
 *
 * @param {string} encryptedBase64 - Şifreli veri (Base64).
 * @returns {string} Çözülmüş metin.
 */
export function decrypt(encryptedBase64) {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  logger.warn('[Crypto] decrypt() henüz implemente edilmedi.');
  return encryptedBase64;
}

/**
 * Kriptografik olarak güvenli, rastgele bir üye işyeri API anahtarı üretir.
 *
 * @returns {string} 64 karakterlik hex anahtar (yalnızca kayıt yanıtında bir kez gösterilir).
 */
export function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * API anahtarının SHA-256 hash'ini döner. Veritabanında yalnızca bu hash saklanır,
 * plaintext anahtar hiçbir yerde tutulmaz.
 *
 * @param {string} apiKey - Ham (plaintext) API anahtarı.
 * @returns {string} Hex SHA-256 hash.
 */
export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

/**
 * Esnaf kaydı sırasında adres sahipliğini kanıtlamak için imzalanacak
 * deterministik mesajı üretir (v2 — Müşteri→Esnaf Ödeme).
 *
 * Durumsuz (stateless) tasarım: sunucuda ayrıca bir nonce/challenge
 * saklanmaz — mesaj tamamen istekten türetilir. Aynı imzanın tekrar
 * gönderilmesi (replay), `Merchant`'ın zaten mevcut `taxId`/`stellarAddress`
 * unique kısıtı tarafından otomatik olarak reddedilir (yeni bir
 * anti-replay mekanizması gerekmez).
 *
 * @param {string} taxId - Vergi kimlik numarası.
 * @param {string} stellarAddress - Esnafın iddia ettiği Stellar adresi (G...).
 * @returns {string} İstemcinin Ed25519 ile imzalaması gereken düz metin mesaj.
 */
export function buildMerchantOwnershipChallenge(taxId, stellarAddress) {
  return `KALEM-MERCHANT-REGISTER:${taxId}:${stellarAddress}`;
}

/**
 * Demo musluk (faucet) mint isteği sırasında adres sahipliğini kanıtlamak
 * için imzalanacak deterministik mesajı üretir (bkz. faucet.routes.js).
 *
 * `timestamp` (epoch ms) mesaja dahil edilir ki aynı imza sonsuza kadar
 * yeniden oynatılamasın — sunucu tarafı yalnızca son birkaç dakika
 * içindeki timestamp'leri kabul eder (bkz. `mintFaucetHandler`).
 *
 * @param {string} address - Mint isteğinde bulunan adres (G...).
 * @param {number} timestamp - İstek anının epoch ms değeri.
 * @returns {string}
 */
export function buildFaucetMintChallenge(address, timestamp) {
  return `KALEM-FAUCET-MINT:${address}:${timestamp}`;
}
