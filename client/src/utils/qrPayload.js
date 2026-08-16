/**
 * Esnaf QR Kod Şeması (KALEM-PAY-V1)
 *
 * Esnaf ekranı (henüz bu iş paketinin kapsamında değil) tutarı girip bu
 * şemada bir JSON üretecek ve QR olarak gösterecektir. Bu dosya yalnızca
 * ÇÖZME/DOĞRULAMA tarafını (müşteri ekranı) içerir — şema burada, tek
 * yerde tanımlanır ki esnaf ekranı yazılırken birebir aynısı üretilsin.
 *
 * QR içeriği (kompakt JSON string):
 * {
 *   "schema": "KALEM-PAY-V1",
 *   "merchantId": "<Mongo ObjectId, 24 hex>",
 *   "stellarAddress": "G...",           // pay_merchant(merchant=...) argümanı
 *   "businessName": "Kalem Kırtasiye",
 *   "totalAmount": "10000000",           // stroop, string, pozitif tamsayı
 *   "cartItems": [ { "name": "...", "quantity": 1, "price": "...", "vatRate": 20 } ], // opsiyonel
 *   "createdAt": 1755289000000            // epoch ms, opsiyonel — çok eski QR için uyarı amaçlı
 * }
 *
 * Not: `merchantId` (Mongo ID, REST body'sinde zorunlu) ile `stellarAddress`
 * (on-chain pay_merchant argümanı) İKİ AYRI ALANDIR — biri veritabanı kaydı,
 * diğeri zincir adresidir, birbirinden türetilemez, ikisi de QR'da olmalıdır.
 */

import { QR_SCHEME_TAG } from './constants.js';
import * as StellarSdk from '@stellar/stellar-sdk';

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const QR_STALE_MS = 15 * 60 * 1000; // 15 dakikadan eski QR'lar için uyarı (reddetme değil)

export class QrPayloadError extends Error {}

/**
 * Kameradan okunan ham QR string'ini doğrulanmış bir ödeme talebine çevirir.
 *
 * @param {string} raw - QR içeriği (ham string).
 * @returns {{merchantId: string, stellarAddress: string, businessName: string, totalAmount: string, cartItems: Array, isStale: boolean}}
 * @throws {QrPayloadError} Format geçersizse.
 */
export function parseQrPayload(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new QrPayloadError('QR kodu okunamadı — geçerli bir KALEM ödeme kodu değil.');
  }

  if (!data || data.schema !== QR_SCHEME_TAG) {
    throw new QrPayloadError('Bu QR kodu bir KALEM ödeme kodu değil.');
  }
  if (typeof data.merchantId !== 'string' || !OBJECT_ID_RE.test(data.merchantId)) {
    throw new QrPayloadError('QR kodundaki esnaf kimliği geçersiz.');
  }
  if (
    typeof data.stellarAddress !== 'string' ||
    !StellarSdk.StrKey.isValidEd25519PublicKey(data.stellarAddress)
  ) {
    throw new QrPayloadError('QR kodundaki esnaf Stellar adresi geçersiz.');
  }
  if (typeof data.totalAmount !== 'string' || !/^[1-9][0-9]*$/.test(data.totalAmount)) {
    throw new QrPayloadError('QR kodundaki tutar geçersiz.');
  }
  if (typeof data.businessName !== 'string' || !data.businessName.trim()) {
    throw new QrPayloadError('QR kodunda esnaf adı eksik.');
  }
  if (data.cartItems !== undefined && !Array.isArray(data.cartItems)) {
    throw new QrPayloadError('QR kodundaki sepet bilgisi geçersiz.');
  }

  const createdAt = typeof data.createdAt === 'number' ? data.createdAt : null;
  const isStale = createdAt !== null && Date.now() - createdAt > QR_STALE_MS;

  return {
    merchantId: data.merchantId,
    stellarAddress: data.stellarAddress,
    businessName: data.businessName.trim(),
    totalAmount: data.totalAmount,
    cartItems: data.cartItems ?? [],
    isStale,
  };
}

/**
 * Esnaf ekranının, müşteri tarafından okutulacak QR'ı üretmesi için.
 * `parseQrPayload`'ın kabul ettiği ŞEMANIN AYNISINI üretir.
 *
 * @param {object} params
 * @param {string} params.merchantId
 * @param {string} params.stellarAddress
 * @param {string} params.businessName
 * @param {string} params.totalAmount - stroop, string.
 * @param {Array} [params.cartItems]
 * @returns {string} QR'a gömülecek JSON string.
 */
export function buildQrPayload({ merchantId, stellarAddress, businessName, totalAmount, cartItems = [] }) {
  return JSON.stringify({
    schema: QR_SCHEME_TAG,
    merchantId,
    stellarAddress,
    businessName,
    totalAmount,
    cartItems,
    createdAt: Date.now(),
  });
}

/**
 * Esnaf ekranı henüz yazılmadığı için Ödeme Ekranı'nı kameraya ihtiyaç
 * duymadan test edebilmek için gerçekçi bir örnek QR yükü üretir.
 * (docs/ARCHITECTURE_DECISIONS.md §7.5'teki gerçek testnet doğrulamasında
 * kullanılan esnaf adresi ve tutarlarla BİREBİR AYNI — uydurma değil.)
 */
export function getSampleQrPayload() {
  return JSON.stringify({
    schema: QR_SCHEME_TAG,
    merchantId: '66f1a2b3c4d5e6f7a8b9c0d1',
    stellarAddress: 'GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B',
    businessName: 'Kalem Kırtasiye',
    totalAmount: '10000000',
    cartItems: [
      { name: 'A4 Fotokopi Kağıdı (5\'li Paket)', quantity: 1, price: '7500000', vatRate: 20 },
      { name: 'Jel Kalem Seti', quantity: 1, price: '2500000', vatRate: 20 },
    ],
    createdAt: Date.now(),
  });
}
