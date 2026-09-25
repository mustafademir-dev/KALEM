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

/**
 * Canlı İşlem Akışı (`/flow` paneli) adımları — sıra, panelde gösterim sırasıdır.
 *
 * Her adım GERÇEK bir backend olayına bağlıdır; hiçbiri zamanlayıcıyla veya
 * tahminle işaretlenmez (bkz. services/flow-events.service.js, docs §9).
 */
export const FLOW_STEPS = Object.freeze([
  'signed', //        1. Ed25519 imzası backend'de doğrulandı
  'received', //      2. Backend'e ulaştı, idempotency kilidi alındı
  'fee_bump', //      3. Fee-Bump dış zarfı Havuz 2 ile imzalandı
  'submitted', //     4. Horizon'a iletildi ve ledger'a yazıldı
  'contract', //      5. Soroban kontratı (pay_merchant) çalıştı — RPC'den okunur
  'distribution', //  6. Atomik dağılım — tutarlar zincirdeki olaylardan okunur
  'caught', //        7. SSE dinleyicisi ya da mutabakat job'ı yakaladı
  'gib', //           8. GİB belgesi üretildi
  'merchant_seen', // 9. Esnaf ekranı ödemeyi gördü (esnaf istemcisinin ack çağrısı)
]);

/**
 * Tek bir akış olayı. `at`, backend'in olayı GÖZLEMLEDİĞİ andır; zincir saati
 * (ledger kapanışı) gerekiyorsa `data.ledgerClosedAt` içinde ayrıca taşınır.
 */
const flowEventSchema = new mongoose.Schema(
  {
    step: { type: String, enum: FLOW_STEPS, required: true },
    status: { type: String, enum: ['done', 'failed'], required: true },
    at: { type: Date, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

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

    /**
     * İç zarfın (müşterinin imzaladığı işlemin) hash'i. `txHash` Fee-Bump DIŞ
     * zarfının hash'idir ve ondan farklıdır (CAP-0015).
     */
    innerTxHash: { type: String, index: true },

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

    /**
     * Sepet kalemleri (QR'dan; birim fiyat = stroop). Güvenilmeyen girdidir —
     * kayıttan önce `utils/cart-items.js#sanitizeCartItems` ile temizlenir. GİB
     * belgesine yalnızca toplamla TAM tutuyorsa yansıtılır.
     */
    cartItems: {
      type: [
        new mongoose.Schema(
          { name: String, quantity: Number, price: String, vatRate: Number },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Dağılım tutarları `pay_merchant` kontrat olayından (zincirden) yazılır,
    // backend'de hesaplanmaz (bkz. services/contract-events.service.js).

    /**
     * Havuz 1 (Esnaf Kasası) — %99,6, esnafın KENDİ adresine giden pay.
     * DİKKAT: `config.pools.pool1Address` (v1 `distribute()`'tan kalma adres)
     * ile İLGİSİ YOKTUR; o adres `pay_merchant` akışında hiç kullanılmaz.
     */
    pool1Amount: { type: String },

    /** Havuz 3 (Sosyal Fon) — %0,1. */
    pool3Amount: { type: String },

    /** Havuz 4 (Operasyonel) — %0,3. */
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

    // --- Canlı İşlem Akışı ---

    /** Ödemenin baştan sona zaman çizelgesi (bkz. FLOW_STEPS). */
    flowEvents: { type: [flowEventSchema], default: [] },

    // --- İade (bkz. services/refund.service.js) ---

    /**
     * Tam iade durumu. `status` zincir onayını anlatır ve iadede DEĞİŞMEZ;
     * iade ayrı tutulur ki mutabakat/SSE yolları onaylı işlemi yeniden
     * "onaylamaya" çalışmasın. Raporlar `refund.status === 'completed'`
     * olanları ciro/komisyon toplamlarından düşer.
     */
    refund: {
      type: new mongoose.Schema(
        {
          status: { type: String, enum: ['processing', 'completed', 'failed'], required: true },
          requestedAt: { type: Date },
          completedAt: { type: Date },
          /** Tamamlanan zincir adımları — yarıda kalan iade kaldığı yerden sürer. */
          steps: {
            type: [new mongoose.Schema({ name: String, txHash: String, at: Date }, { _id: false })],
            default: [],
          },
          error: { type: String },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// Esnaf işlem listesi / günlük özet / gün sonu raporu sorguları:
// `merchantId` ile filtreleyip `createdAt` aralığına göre sıralar.
transactionSchema.index({ merchantId: 1, createdAt: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction;
