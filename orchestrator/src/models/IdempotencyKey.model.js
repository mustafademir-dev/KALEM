/**
 * Idempotency Key MongoDB Modeli.
 *
 * Mükerrer çekim koruması (Bölüm 5.6.3).
 *
 * İstemciden gelen benzersiz UUID'ler bu koleksiyonda saklanır.
 * writeConcern: majority ve readConcern: linearizable ile tasarlanmıştır.
 * Yalnızca webhook girişinin işlendiği kritik noktada bir kez devreye girer.
 */

import mongoose from 'mongoose';

const idempotencyKeySchema = new mongoose.Schema(
  {
    /** İstemciden gelen benzersiz UUID. */
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /** Bu key ile ilişkili işlemin durumu. */
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing',
    },

    /** İşlem sonucu (başarılı ise tx hash, vb.). */
    result: {
      type: mongoose.Schema.Types.Mixed,
    },

    /** Hangi işlem kaydıyla ilişkili. */
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    },

    /** Key'in geçerlilik süresi (TTL). */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 saat
      index: { expires: 0 }, // MongoDB TTL index
    },
  },
  {
    timestamps: true,
    // writeConcern ve readConcern query seviyesinde uygulanacak,
    // schema seviyesinde değil — idempotency.service.js'de yönetilir.
  }
);

const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);

export default IdempotencyKey;
