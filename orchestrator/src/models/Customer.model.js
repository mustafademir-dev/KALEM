/**
 * Müşteri hesabı (TC + 6 haneli PIN).
 *
 * TC kimlik numarası AÇIK HÂLDE SAKLANMAZ — yalnızca sunucu gizli anahtarıyla
 * alınmış HMAC özeti (`tcHash`) tutulur (bkz. utils/credentials.js). PIN scrypt
 * özetidir. `stellarAddress` müşterinin ŞU ANKİ cihazındaki cüzdandır; cüzdan
 * anahtarı cihazdan çıkmaz. Yeni cihazda giriş yapılınca bakiye eski adresten
 * yenisine taşınır (bkz. services/customer-account.service.js).
 */

import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    tcHash: { type: String, required: true, unique: true, index: true },
    pinHash: { type: String, required: true, select: false },
    stellarAddress: { type: String, required: true, unique: true },

    /** Önceki cihazların cüzdan adresleri — fiş geçmişi yeni cihazda da görünsün diye. */
    addressHistory: { type: [String], default: [] },

    /** Yarıda kalmış cihaz değişimi: eski adresten yakıldı ama yeniye henüz basılmadıysa. */
    pendingMigration: {
      type: new mongoose.Schema(
        { from: String, amount: String, burnTxHash: String, at: Date },
        { _id: false }
      ),
      default: undefined,
    },

    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
