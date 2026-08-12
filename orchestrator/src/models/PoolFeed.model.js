/**
 * Havuz 4 -> Havuz 2 Besleme Döngüsü (Pool Feed) MongoDB Modeli.
 *
 * Her besleme döngüsü (burn + off-chain dönüşüm + XLM enjeksiyonu) burada
 * kalıcı olarak izlenir. Burn geri alınamaz bir mali olay olduğu için bir
 * log satırı yeterli denetim kaydı sayılmaz.
 *
 * `lockKey` üzerindeki kısmi unique index, aynı anda yalnızca BİR açık
 * besleme döngüsüne izin vererek çift-burn'ü engeller: döngü 'pending'
 * olarak burn'den ÖNCE açılır, ikinci bir eşzamanlı/art arda tetikleme
 * MongoDB'nin E11000 hatasıyla reddedilir. Süreç yeniden başlasa
 * (crash/redeploy) bile açık kayıt kalıcıdır.
 */

import mongoose from 'mongoose';

const poolFeedSchema = new mongoose.Schema(
  {
    /** Kısmi unique index'in hedeflediği sabit anahtar. */
    lockKey: {
      type: String,
      default: 'POOL_FEED_ACTIVE',
    },

    /** Döngü durumu. */
    status: {
      type: String,
      enum: ['pending', 'burn_submitted', 'awaiting_offchain', 'completed', 'failed'],
      default: 'pending',
    },

    /** Tetikleme anındaki Havuz 2 XLM bakiyesi ve eşik (XLM). */
    pool2BalanceBefore: { type: String },
    pool2Threshold: { type: String },

    /** Havuz 4 dTL bakiyesi ve fiilen yakılan tutar (stroops). */
    pool4DtlBalance: { type: String },
    burnAmount: { type: String },
    burnTxHash: { type: String, sparse: true, index: true },

    /** Off-chain dönüşüm ve XLM enjeksiyonu. */
    exchangeRateNote: { type: String },
    injectXlmAmount: { type: String },
    injectTxHash: { type: String, sparse: true },

    errorMessage: { type: String },
    completedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Aynı anda YALNIZCA BİR açık besleme döngüsü olabilir (çift-burn kilidi).
poolFeedSchema.index(
  { lockKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ['pending', 'burn_submitted', 'awaiting_offchain'] },
    },
  }
);

const PoolFeed = mongoose.model('PoolFeed', poolFeedSchema);

export default PoolFeed;
