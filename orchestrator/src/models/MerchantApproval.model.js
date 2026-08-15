/**
 * Esnaf Onay Denetim Kaydı (Merchant Approval Audit) MongoDB Modeli.
 *
 * v2 (Müşteri→Esnaf Ödeme): `register_merchant()` on-chain çağrısı
 * `orchestrator/scripts/approve-merchant.mjs` tarafından, bir operatör
 * eliyle tetiklenir — giriş/kimlik doğrulama sistemi olmadığı için hesap
 * verebilirlik burada sağlanır: kim, ne zaman, hangi esnafı onayladı/
 * onaylamaya çalıştı, hangi tx hash'iyle sonuçlandı.
 *
 * `PoolFeed.model.js` ile aynı "kalıcı denetim izi" felsefesi — bir log
 * satırı, geri alınamaz bir on-chain yetki değişikliği için yeterli
 * denetim kaydı sayılmaz.
 */

import mongoose from 'mongoose';

const merchantApprovalSchema = new mongoose.Schema(
  {
    /** Onaylanan/onaylanmaya çalışılan üye işyeri. */
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },

    /** İşlemi tetikleyen operatör (CLI --operator flag'i, giriş sistemi yok). */
    operator: {
      type: String,
      required: true,
    },

    /** Sonuç durumu. */
    status: {
      type: String,
      enum: ['pending', 'completed', 'already_registered', 'failed'],
      default: 'pending',
    },

    /** Başarılı register_merchant işleminin tx hash'i. */
    registerTxHash: { type: String, sparse: true },

    /** Hata mesajı (başarısız olursa) veya açıklayıcı not (ör. "zaten kayıtlıydı"). */
    errorMessage: { type: String },
    notes: { type: String },
  },
  {
    timestamps: true,
  }
);

const MerchantApproval = mongoose.model('MerchantApproval', merchantApprovalSchema);

export default MerchantApproval;
