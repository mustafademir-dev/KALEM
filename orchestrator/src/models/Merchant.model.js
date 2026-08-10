/**
 * Üye İşyeri (Merchant) MongoDB Modeli.
 *
 * KYC/KYB bilgileri ve Stellar cüzdan adresi.
 */

import mongoose from 'mongoose';

const merchantSchema = new mongoose.Schema(
  {
    /** İşyeri ticari unvanı. */
    businessName: {
      type: String,
      required: true,
    },

    /** Vergi kimlik numarası. */
    taxId: {
      type: String,
      required: true,
      unique: true,
    },

    /** İşyerinin Stellar adresi (dTL bakiyesini tutan Soroban adresi). */
    stellarAddress: {
      type: String,
      required: true,
      unique: true,
    },

    /** KYC/KYB doğrulama durumu. */
    kycStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },

    /** İletişim e-posta adresi. */
    email: { type: String },

    /** İletişim telefon numarası. */
    phone: { type: String },

    /** Hesap aktiflik durumu. */
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Merchant = mongoose.model('Merchant', merchantSchema);

export default Merchant;
