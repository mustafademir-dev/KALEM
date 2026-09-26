/**
 * GİB Belgesi (ÖKC/e-Belge) MongoDB Modeli.
 *
 * PoC'de GİB API'lerine gerçek erişim yoktur; bu model simüle edilmiş
 * ÖKC protokolü ve UBL-TR standartlarına uygun belge taslağını saklar.
 */

import mongoose from 'mongoose';

const gibDocumentSchema = new mongoose.Schema(
  {
    /** İlişkili işlem kaydı. */
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
    },

    /** Stellar transaction hash. */
    txHash: {
      type: String,
      required: true,
    },

    /** Belge tipi. */
    documentType: {
      type: String,
      enum: ['okc_fis', 'e_arsiv', 'e_fatura'],
      default: 'e_arsiv', // GMÖEBYS; 'okc_fis' yalnızca 26 Eylül 2026 öncesi belgelerde
    },

    /** UBL-TR formatında belge içeriği (JSON). */
    ublContent: {
      type: mongoose.Schema.Types.Mixed,
    },

    /** XML çıktısı (simüle). */
    xmlContent: {
      type: String,
    },

    /** Belge durumu. */
    status: {
      type: String,
      enum: ['draft', 'generated', 'simulated_sent'],
      default: 'draft',
    },

    /** Üye işyeri vergi kimlik numarası. */
    merchantTaxId: { type: String },

    /** Toplam tutar (TL cinsinden gösterim). */
    totalAmountTL: { type: String },
  },
  {
    timestamps: true,
  }
);

const GibDocument = mongoose.model('GibDocument', gibDocumentSchema);

export default GibDocument;
