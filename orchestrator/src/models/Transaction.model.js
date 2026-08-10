/**
 * İşlem Kaydı (Transaction) MongoDB Modeli.
 *
 * Dual-Ledger mimarisinin off-chain (Web2) tarafını temsil eder.
 * On-chain (Stellar) tarafı blokzincirdeki transaction hash ile eşlenir.
 *
 * Finansal mutabakatın nihai kaydı blokzincir üzerinde tutulur;
 * bu model yalnızca operasyonel durum yönetimi ve GİB eşlemesi içindir.
 */

import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    // --- Tanımlayıcılar ---

    /** Stellar blokzincir transaction hash'i. */
    txHash: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    /** İşlemi başlatan idempotency key (UUID). */
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // --- Taraflar ---

    /** Ödeme yapan müşteri/esnaf Stellar adresi. */
    senderAddress: {
      type: String,
      required: true,
    },

    /** Üye işyeri (esnaf) ID referansı. */
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
    },

    // --- Tutar ve Dağılım ---

    /** Toplam tahsilat tutarı (dTL, stroops cinsinden). */
    totalAmount: {
      type: String, // i128 uyumluluğu için string
      required: true,
    },

    /** Havuz 1'e aktarılan tutar (Likidite). */
    pool1Amount: { type: String },

    /** Havuz 3'e aktarılan tutar (Sosyal). */
    pool3Amount: { type: String },

    /** Havuz 4'e aktarılan tutar (Operasyonel). */
    pool4Amount: { type: String },

    // --- Durum ---

    /** İşlem durumu. */
    status: {
      type: String,
      enum: ['pending', 'submitted', 'confirmed', 'failed'],
      default: 'pending',
    },

    /** Stellar ledger numarası (onaylandığında). */
    ledgerNumber: { type: Number },

    /** Hata mesajı (başarısız olursa). */
    errorMessage: { type: String },

    // --- GİB Eşlemesi ---

    /** İlişkili GİB belge ID'si. */
    gibDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GibDocument',
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
