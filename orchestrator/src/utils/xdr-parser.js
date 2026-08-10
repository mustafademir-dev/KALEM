/**
 * XDR Ayrıştırma Yardımcıları
 *
 * Stellar XDR (Base64) ↔ JSON dönüşümleri.
 * İstemciden gelen imzalı işlem paketlerinin parse edilmesi
 * ve Fee-Bump sarmalama öncesi doğrulama.
 */

// import * as StellarSdk from '@stellar/stellar-sdk';
import logger from './logger.js';

/**
 * Base64/XDR formatındaki işlemi parse eder.
 *
 * @param {string} xdrString - Base64 kodlanmış XDR.
 * @param {string} networkPassphrase - Ağ passphrase'i.
 * @returns {object} Parse edilmiş Stellar Transaction nesnesi.
 */
export function parseXdr(xdrString, networkPassphrase) {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  // return StellarSdk.TransactionBuilder.fromXDR(xdrString, networkPassphrase);
  logger.warn('[XDR] parseXdr() henüz implemente edilmedi.');
  return null;
}

/**
 * Transaction nesnesini Base64/XDR'a dönüştürür.
 *
 * @param {object} transaction - Stellar Transaction nesnesi.
 * @returns {string} Base64 kodlanmış XDR.
 */
export function toXdr(transaction) {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  // return transaction.toXDR();
  logger.warn('[XDR] toXdr() henüz implemente edilmedi.');
  return '';
}
