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
 */

import GibDocument from '../models/GibDocument.model.js';
import logger from '../utils/logger.js';

/**
 * Onaylanan işlem için simüle ÖKC/e-Belge (UBL-TR) taslağı üretir ve MongoDB'ye kaydeder.
 *
 * @param {object} params
 * @param {string} params.txHash - Stellar transaction hash.
 * @param {string} params.transactionId - MongoDB Transaction _id.
 * @param {string} [params.merchantTaxId='1234567890'] - Üye işyeri VKN.
 * @param {string} [params.totalAmountTL='0'] - TL/dTL cinsinden toplam tutar.
 * @param {Array<object>} [params.cartItems=[]] - Sepet kalemleri listesi.
 * @returns {Promise<object>} Oluşturulan ve kaydedilen GibDocument Mongoose belgesi.
 */
export async function generateGibDocument({
  txHash,
  transactionId,
  merchantTaxId = '1234567890',
  totalAmountTL = '0',
  cartItems = [],
}) {
  try {
    logger.info(`[GİB] UBL-TR Belge taslağı üretiliyor (TxHash: ${txHash})`);

    const now = new Date();
    const issueDate = now.toISOString().split('T')[0];
    const issueTime = now.toTimeString().split(' ')[0];
    const documentId = `KALEM${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${now.getTime().toString().slice(-6)}`;

    const parsedTotal = parseFloat(totalAmountTL) || 0;
    // Varsayılan KDV %20 hesabı
    const kdvRate = 0.20;
    const taxExclusiveAmount = (parsedTotal / (1 + kdvRate)).toFixed(2);
    const taxAmount = (parsedTotal - parseFloat(taxExclusiveAmount)).toFixed(2);

    // Sepet kalemleri boşsa varsayılan kalem oluştur
    const formattedLines = cartItems.length > 0
      ? cartItems.map((item, idx) => ({
          ID: String(idx + 1),
          InvoicedQuantity: item.quantity || 1,
          LineExtensionAmount: (item.price * (item.quantity || 1)).toFixed(2),
          Item: {
            Name: item.name || `Ürün Kalemi ${idx + 1}`,
          },
          Price: {
            PriceAmount: (item.price || 0).toFixed(2),
          },
        }))
      : [
          {
            ID: '1',
            InvoicedQuantity: 1,
            LineExtensionAmount: taxExclusiveAmount,
            Item: {
              Name: 'Genel Perakende Satış',
            },
            Price: {
              PriceAmount: taxExclusiveAmount,
            },
          },
        ];

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
            PartyName: { Name: 'KALEM Entegre Üye İşyeri' },
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
          TaxInclusiveAmount: parsedTotal.toFixed(2),
          PayableAmount: parsedTotal.toFixed(2),
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
  <TotalAmount currencyID="TRY">${parsedTotal.toFixed(2)}</TotalAmount>
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
      totalAmountTL: String(parsedTotal),
    });

    logger.info(`[GİB] Belge taslağı başarıyla oluşturuldu ve kaydedildi (ID: ${gibDocument._id})`);
    return gibDocument;
  } catch (error) {
    logger.error(`[GİB] generateGibDocument hatası: ${error.message}`);
    throw error;
  }
}
