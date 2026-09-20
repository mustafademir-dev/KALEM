/**
 * GİB Simülasyon Servisi
 *
 * Bölüm 5.5.3: PoC'de canlı GİB API'lerine erişim yoktur.
 * Bu servis, ÖKC protokolüne ve UBL-TR standartlarına uygun
 * JSON/XML belge taslağı üretir.
 *
 * Akış:
 * 1. SSE listener'dan tx hash ve işlem bilgileri gelir
 * 2. UBL-TR 2.1 standardına uygun e-Fatura / ÖKC Fiş JSON taslağı oluşturulur
 * 3. XML çıktısı simüle edilir
 * 4. GibDocument.create({ ... }) ile MongoDB'ye kaydedilir (status = 'generated')
 *
 * PARA BİRİMİ (19 Eylül 2026 düzeltmesi): tutarlar bu servise STROOP olarak
 * gelir (1 dTL = 1 TL = 10.000.000 stroop) ve burada TL'ye ÇEVRİLİR. Önceki
 * sürüm stroop değerini doğrudan TL sayıyordu (5 TL'lik ödeme fişte
 * 50.000.000 TL çıkıyordu); bu düzeltmeden ÖNCE üretilmiş belgeler DEĞİŞTİRİLMEDİ.
 * Belgeler kuruşa (2 ondalık) yuvarlanır; KDV %20 sabittir (simülasyon).
 */

import GibDocument from '../models/GibDocument.model.js';
import logger from '../utils/logger.js';
import { stroopsToKurus, kurusToFixed2, kurusExcludingVat } from '../utils/money.js';
import { cartMatchesTotal } from '../utils/cart-items.js';

/**
 * Onaylanan işlem için simüle ÖKC/e-Belge (UBL-TR) taslağı üretir ve MongoDB'ye kaydeder.
 *
 * @param {object} params
 * @param {string} params.txHash - Stellar transaction hash.
 * @param {string} params.transactionId - MongoDB Transaction _id.
 * @param {string} [params.merchantTaxId='1234567890'] - Üye işyeri VKN (gerçek `Merchant.taxId`).
 * @param {string} [params.merchantName] - Üye işyeri adı (gerçek `Merchant.businessName`).
 * @param {string} [params.totalAmountStroops='0'] - Müşterinin ödediği toplam tutar (stroop).
 * @param {Array<{name: string, quantity: number, price: string}>} [params.cartItems=[]] -
 *   Temizlenmiş sepet (birim fiyat = stroop). Yalnızca toplamla TAM tutuyorsa satırlara yansıtılır.
 * @returns {Promise<object>} Oluşturulan ve kaydedilen GibDocument Mongoose belgesi.
 */
export async function generateGibDocument({
  txHash,
  transactionId,
  merchantTaxId = '1234567890',
  merchantName = 'KALEM Entegre Üye İşyeri',
  totalAmountStroops = '0',
  cartItems = [],
}) {
  try {
    logger.info(`[GİB] UBL-TR Belge taslağı üretiliyor (TxHash: ${txHash})`);

    const now = new Date();
    const issueDate = now.toISOString().split('T')[0];
    const issueTime = now.toTimeString().split(' ')[0];
    const documentId = `KALEM${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${now.getTime().toString().slice(-6)}`;

    const totalKurus = stroopsToKurus(totalAmountStroops);
    const taxExclusiveKurus = kurusExcludingVat(totalKurus);
    const taxKurus = totalKurus - taxExclusiveKurus;

    const totalFixed = kurusToFixed2(totalKurus);
    const taxExclusiveAmount = kurusToFixed2(taxExclusiveKurus);
    const taxAmount = kurusToFixed2(taxKurus);

    // Sepet YALNIZCA toplamla tam tutuyorsa satırlara yansıtılır (aksi halde
    // satırları toplamla uyuşmayan bir belge üretmek yerine tek satır kullanılır).
    const useCart = cartMatchesTotal(cartItems, String(totalAmountStroops));
    let formattedLines;
    if (useCart) {
      const lineKurus = cartItems.map((item) =>
        kurusExcludingVat(stroopsToKurus(BigInt(item.price) * BigInt(item.quantity)))
      );
      // Satır başına yuvarlama farkını son satıra yükle: Σ satır == matrah (kuruşu kuruşuna).
      const drift = taxExclusiveKurus - lineKurus.reduce((a, b) => a + b, 0n);
      lineKurus[lineKurus.length - 1] += drift;

      formattedLines = cartItems.map((item, idx) => ({
        ID: String(idx + 1),
        InvoicedQuantity: item.quantity,
        LineExtensionAmount: kurusToFixed2(lineKurus[idx]),
        Item: { Name: item.name },
        Price: { PriceAmount: kurusToFixed2(kurusExcludingVat(stroopsToKurus(item.price))) },
      }));
    } else {
      formattedLines = [
        {
          ID: '1',
          InvoicedQuantity: 1,
          LineExtensionAmount: taxExclusiveAmount,
          Item: { Name: 'Genel Perakende Satış' },
          Price: { PriceAmount: taxExclusiveAmount },
        },
      ];
    }

    // UBL-TR 2.1 Standart JSON Yapısı
    const ublContent = {
      Invoice: {
        UBLVersionID: '2.1',
        CustomizationID: 'TR1.2',
        ProfileID: 'TICARIFATURA',
        ID: documentId,
        CopyIndicator: false,
        UUID: `urn:uuid:${transactionId || '00000000-0000-0000-0000-000000000000'}`,
        IssueDate: issueDate,
        IssueTime: issueTime,
        InvoiceTypeCode: 'SATIS',
        DocumentCurrencyCode: 'TRY',
        LineCountNumeric: formattedLines.length,
        AccountingSupplierParty: {
          Party: {
            PartyIdentification: [{ ID: { schemeID: 'VKN', value: merchantTaxId } }],
            PartyName: { Name: merchantName },
          },
        },
        TaxTotal: {
          TaxAmount: taxAmount,
          TaxSubtotal: {
            TaxableAmount: taxExclusiveAmount,
            TaxAmount: taxAmount,
            Percent: 20,
            TaxCategory: { TaxScheme: { Name: 'KDV', TaxTypeCode: '0015' } },
          },
        },
        LegalMonetaryTotal: {
          LineExtensionAmount: taxExclusiveAmount,
          TaxExclusiveAmount: taxExclusiveAmount,
          TaxInclusiveAmount: totalFixed,
          PayableAmount: totalFixed,
        },
        InvoiceLine: formattedLines,
        AdditionalDocumentReference: {
          ID: txHash,
          DocumentType: 'StellarBlokzincirTxHash',
          IssueDate: issueDate,
        },
      },
    };

    // XML Çıktısı Simülasyonu
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" UBLVersionID="2.1">
  <ID>${documentId}</ID>
  <IssueDate>${issueDate}</IssueDate>
  <IssueTime>${issueTime}</IssueTime>
  <InvoiceTypeCode>SATIS</InvoiceTypeCode>
  <SupplierVKN>${merchantTaxId}</SupplierVKN>
  <TotalAmount currencyID="TRY">${totalFixed}</TotalAmount>
  <StellarTxHash>${txHash}</StellarTxHash>
</Invoice>`;

    // MongoDB'ye Kayıt
    const gibDocument = await GibDocument.create({
      transactionId,
      txHash,
      documentType: 'okc_fis',
      ublContent,
      xmlContent,
      status: 'generated',
      merchantTaxId,
      totalAmountTL: totalFixed,
    });

    logger.info(`[GİB] Belge taslağı başarıyla oluşturuldu ve kaydedildi (ID: ${gibDocument._id})`);
    return gibDocument;
  } catch (error) {
    logger.error(`[GİB] generateGibDocument hatası: ${error.message}`);
    throw error;
  }
}
