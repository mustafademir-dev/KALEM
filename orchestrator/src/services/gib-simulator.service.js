/**
 * GİB Simülasyon Servisi
 *
 * Bölüm 5.5.3: PoC'de canlı GİB API'lerine erişim yoktur.
 * Bu servis, UBL-TR standardına uygun e-Arşiv Fatura taslağı üretir.
 *
 * BELGE TÜRÜ (26 Eylül 2026): KALEM'in yasal zemini GMÖEBYS'dir (507 Sıra No'lu VUK
 * Genel Tebliği) — md. 5/3: sisteme dahil esnafın ÖKC kullanma mecburiyeti yoktur;
 * md. 4/3: ödeme, özel entegratör aracılığıyla ANLIK olarak, belgeyi düzenleyecek
 * mükellefin (esnafın) mükellefiyet türüne uygun e-belgeye dönüştürülür. Bu yüzden
 * yeni belgeler ÖKC fişi (`okc_fis`) değil, esnaf VKN'siyle ve alıcısı "NİHAİ TÜKETİCİ"
 * olan e-Arşiv Fatura (`e_arsiv`) olarak üretilir. Eski `okc_fis` belgeler DEĞİŞTİRİLMEDİ.
 * (Nihai tüketici tutar sınırı prototipte uygulanmaz; üründe entegratör uygular.)
 *
 * Akış:
 * 1. SSE listener'dan tx hash ve işlem bilgileri gelir
 * 2. UBL-TR 2.1 standardına uygun e-Arşiv Fatura JSON taslağı oluşturulur
 * 3. XML çıktısı simüle edilir
 * 4. GibDocument.create({ ... }) ile MongoDB'ye kaydedilir (status = 'generated')
 *
 * PARA BİRİMİ (19 Eylül 2026 düzeltmesi): tutarlar bu servise STROOP olarak
 * gelir (1 dTL = 1 TL = 10.000.000 stroop) ve burada TL'ye ÇEVRİLİR. Önceki
 * sürüm stroop değerini doğrudan TL sayıyordu (5 TL'lik ödeme fişte
 * 50.000.000 TL çıkıyordu); bu düzeltmeden ÖNCE üretilmiş belgeler DEĞİŞTİRİLMEDİ.
 * Belgeler kuruşa (2 ondalık) yuvarlanır. KDV oranı sepet kaleminin departmanından gelir
 * (%1/%10/%20; bkz. utils/vat.js); oran yoksa %20.
 */

import GibDocument from '../models/GibDocument.model.js';
import logger from '../utils/logger.js';
import { stroopsToKurus, kurusToFixed2, kurusExcludingVat } from '../utils/money.js';
import { vatBreakdown, clampToAllowed, DEFAULT_VAT_RATE } from '../utils/vat.js';

/**
 * Onaylanan işlem için simüle e-Arşiv Fatura (UBL-TR) taslağı üretir ve MongoDB'ye kaydeder.
 *
 * @param {object} params
 * @param {string} params.txHash - Stellar transaction hash.
 * @param {string} params.transactionId - MongoDB Transaction _id.
 * @param {string} [params.merchantTaxId='1234567890'] - Üye işyeri VKN (gerçek `Merchant.taxId`).
 * @param {string} [params.merchantName] - Üye işyeri adı (gerçek `Merchant.businessName`).
 * @param {string} [params.totalAmountStroops='0'] - Müşterinin ödediği toplam tutar (stroop).
 * @param {Array<{name: string, quantity: number, price: string, vatRate?: number}>} [params.cartItems=[]] -
 *   Temizlenmiş sepet (birim fiyat = stroop). Yalnızca toplamla TAM tutuyorsa satırlara yansıtılır.
 * @param {number[]} [params.allowedVatRates] - Esnafın izinli oranları; dışındaki oran izinliye çekilir.
 * @returns {Promise<object>} Oluşturulan ve kaydedilen GibDocument Mongoose belgesi.
 */
export async function generateGibDocument({
  txHash,
  transactionId,
  merchantTaxId = '1234567890',
  merchantName = 'KALEM Entegre Üye İşyeri',
  totalAmountStroops = '0',
  cartItems = [],
  allowedVatRates,
}) {
  try {
    logger.info(`[GİB] UBL-TR Belge taslağı üretiliyor (TxHash: ${txHash})`);

    const now = new Date();
    const issueDate = now.toISOString().split('T')[0];
    const issueTime = now.toTimeString().split(' ')[0];
    const documentId = `KALEM${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${now.getTime().toString().slice(-6)}`;

    // Esnafa izin verilmeyen oran (QR yolda değiştirilmiş olabilir) izinli orana çekilir.
    // Alanlar tek tek kopyalanır: Mongoose alt belgelerinde `{...item}` alanları taşımaz.
    const items = (cartItems ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      vatRate: clampToAllowed(item.vatRate ?? DEFAULT_VAT_RATE, allowedVatRates),
    }));
    const vat = vatBreakdown(String(totalAmountStroops), items);

    const totalFixed = kurusToFixed2(vat.totalKurus);
    const taxExclusiveAmount = kurusToFixed2(vat.exclKurus);
    const taxAmount = kurusToFixed2(vat.vatKurus);

    // Sepet YALNIZCA toplamla tam tutuyorsa satırlara yansıtılır (aksi halde
    // satırları toplamla uyuşmayan bir belge üretmek yerine tek satır kullanılır).
    let formattedLines;
    if (vat.useCart) {
      const lineKurus = items.map((item) =>
        kurusExcludingVat(stroopsToKurus(BigInt(item.price) * BigInt(item.quantity)), item.vatRate)
      );
      // Oran grubu başına yuvarlama farkını grubun son satırına yükle: Σ satır == grup matrahı.
      for (const g of vat.groups) {
        const idx = items.map((it, i) => (it.vatRate === g.rate ? i : -1)).filter((i) => i >= 0);
        const drift = g.exclKurus - idx.reduce((acc, i) => acc + lineKurus[i], 0n);
        lineKurus[idx[idx.length - 1]] += drift;
      }

      formattedLines = items.map((item, idx) => ({
        ID: String(idx + 1),
        InvoicedQuantity: item.quantity,
        LineExtensionAmount: kurusToFixed2(lineKurus[idx]),
        Item: { Name: item.name },
        Price: { PriceAmount: kurusToFixed2(kurusExcludingVat(stroopsToKurus(item.price), item.vatRate)) },
        TaxTotal: { TaxSubtotal: { Percent: item.vatRate } },
      }));
    } else {
      formattedLines = [
        {
          ID: '1',
          InvoicedQuantity: 1,
          LineExtensionAmount: taxExclusiveAmount,
          Item: { Name: 'Genel Perakende Satış' },
          Price: { PriceAmount: taxExclusiveAmount },
          TaxTotal: { TaxSubtotal: { Percent: DEFAULT_VAT_RATE } },
        },
      ];
    }

    // Oran başına KDV alt toplamları (tek oran varsa da dizi).
    const taxSubtotals = vat.groups.map((g) => ({
      TaxableAmount: kurusToFixed2(g.exclKurus),
      TaxAmount: kurusToFixed2(g.inclKurus - g.exclKurus),
      Percent: g.rate,
      TaxCategory: { TaxScheme: { Name: 'KDV', TaxTypeCode: '0015' } },
    }));

    // UBL-TR 2.1 Standart JSON Yapısı
    const ublContent = {
      Invoice: {
        UBLVersionID: '2.1',
        CustomizationID: 'TR1.2',
        ProfileID: 'EARSIVFATURA',
        ID: documentId,
        CopyIndicator: false,
        UUID: `urn:uuid:${transactionId || '00000000-0000-0000-0000-000000000000'}`,
        IssueDate: issueDate,
        IssueTime: issueTime,
        InvoiceTypeCode: 'SATIS',
        DocumentCurrencyCode: 'TRY',
        LineCountNumeric: formattedLines.length,
        Note: [
          "Güvenli Mobil Ödeme ve Elektronik Belge Yönetim Sistemi (507 Sıra No'lu VUK Genel Tebliği) kapsamında düzenlenmiştir.",
        ],
        AccountingSupplierParty: {
          Party: {
            PartyIdentification: [{ ID: { schemeID: 'VKN', value: merchantTaxId } }],
            PartyName: { Name: merchantName },
          },
        },
        // Perakende satış: alıcı bilgisi yerine "NİHAİ TÜKETİCİ" (GMÖEBYS uygulaması).
        AccountingCustomerParty: {
          Party: {
            PartyIdentification: [{ ID: { schemeID: 'TCKN', value: '11111111111' } }],
            PartyName: { Name: 'NİHAİ TÜKETİCİ' },
          },
        },
        TaxTotal: {
          TaxAmount: taxAmount,
          TaxSubtotal: taxSubtotals,
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
  <ProfileID>EARSIVFATURA</ProfileID>
  <ID>${documentId}</ID>
  <IssueDate>${issueDate}</IssueDate>
  <IssueTime>${issueTime}</IssueTime>
  <InvoiceTypeCode>SATIS</InvoiceTypeCode>
  <SupplierVKN>${merchantTaxId}</SupplierVKN>
  <CustomerName>NİHAİ TÜKETİCİ</CustomerName>
  <TotalAmount currencyID="TRY">${totalFixed}</TotalAmount>
  <StellarTxHash>${txHash}</StellarTxHash>
</Invoice>`;

    // MongoDB'ye Kayıt
    const gibDocument = await GibDocument.create({
      transactionId,
      txHash,
      documentType: 'e_arsiv',
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
