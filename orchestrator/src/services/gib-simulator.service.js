/**
 * GİB Simülasyon Servisi
 *
 * Bölüm 5.5.3: PoC'de canlı GİB API'lerine erişim yoktur.
 * Bu servis, ÖKC protokolüne ve UBL-TR standartlarına uygun
 * JSON/XML belge taslağı üretir.
 *
 * Akış:
 * 1. SSE listener'dan tx hash ve havuz dağılım bilgisi gelir
 * 2. MongoDB'den sepet/ürün detayları (Web2 verisi) alınır
 * 3. Kriptografik ID ile eşleştirilir
 * 4. UBL-TR formatında belge taslağı oluşturulur
 */

import GibDocument from '../models/GibDocument.model.js';
import logger from '../utils/logger.js';

/**
 * Onaylanan işlem için simüle ÖKC/e-Belge taslağı üretir.
 *
 * @param {object} params
 * @param {string} params.txHash - Stellar transaction hash.
 * @param {string} params.transactionId - MongoDB Transaction _id.
 * @param {string} params.merchantTaxId - Üye işyeri VKN.
 * @param {string} params.totalAmountTL - TL cinsinden toplam tutar.
 * @param {Array} params.cartItems - Sepet kalemleri.
 * @returns {Promise<object>} Oluşturulan GibDocument kaydı.
 */
export async function generateGibDocument({
  txHash,
  transactionId,
  merchantTaxId,
  totalAmountTL,
  cartItems,
}) {
  // TODO: Faz 2 Aşama 3.5'te (GİB/ÖKC simülatörü) implemente edilecek.
  //
  // 1. UBL-TR uyumlu JSON yapısı oluştur:
  //    - Belge numarası (simüle seri)
  //    - Tarih/saat
  //    - Satıcı VKN
  //    - Kalem listesi (cartItems → UBL InvoiceLine)
  //    - Toplam tutar, KDV hesabı
  //    - Stellar tx hash referansı
  //
  // 2. JSON → XML dönüşümü (basit template)
  //
  // 3. GibDocument.create({ ... }) ile MongoDB'ye kaydet

  logger.warn('[GİB] generateGibDocument() henüz implemente edilmedi.');
  return null;
}
