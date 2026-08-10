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
