/**
 * Stellar İşlem Servisi
 *
 * Stellar SDK üzerinden işlem oluşturma, Soroban kontrat çağrısı
 * (invoke) ve Horizon API etkileşim yardımcıları.
 */

import logger from '../utils/logger.js';
// import * as StellarSdk from '@stellar/stellar-sdk';
// import stellarConfig from '../config/stellar.js';
// import config from '../config/index.js';

/**
 * Soroban kontrat fonksiyonu çağrısı için işlem oluşturur.
 *
 * @param {object} params
 * @param {string} params.sourceAddress - İşlemi başlatan adres.
 * @param {string} params.contractId - Hedef kontrat ID'si.
 * @param {string} params.method - Çağrılacak fonksiyon adı.
 * @param {Array} params.args - Fonksiyon argümanları (Soroban xdr formatında).
 * @returns {Promise<string>} Oluşturulan işlemin XDR'ı (imzalanmamış).
 */
export async function buildContractCall({ sourceAddress, contractId, method, args }) {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  logger.warn('[StellarTx] buildContractCall() henüz implemente edilmedi.');
  throw new Error('NOT_IMPLEMENTED');
}

/**
 * Belirtilen adresin hesap bilgilerini Horizon'dan çeker.
 *
 * @param {string} address - Stellar adresi (G... veya C...).
 * @returns {Promise<object>} Hesap bilgisi.
 */
export async function loadAccount(address) {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  logger.warn('[StellarTx] loadAccount() henüz implemente edilmedi.');
  throw new Error('NOT_IMPLEMENTED');
}

/**
 * Hazır (imzalı) bir işlemi Horizon'a gönderir.
 *
 * @param {object} transaction - Stellar Transaction nesnesi.
 * @returns {Promise<object>} Horizon yanıtı.
 */
export async function submitTransaction(transaction) {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  logger.warn('[StellarTx] submitTransaction() henüz implemente edilmedi.');
  throw new Error('NOT_IMPLEMENTED');
}
