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

    /** API anahtarının SHA-256 hash'i. Plaintext anahtar hiçbir yerde saklanmaz. */
    apiKeyHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    /** Giriş şifresinin scrypt özeti (VKN + şifre ile giriş; bkz. POST /merchants/login). */
    passwordHash: { type: String, select: false },

    /**
     * Girişte verilen oturum anahtarlarının SHA-256 özetleri (en fazla 10).
     * Birden fazla cihaz aynı anda açık kalabilsin diye liste; `apiKeyHash`
     * (kayıtta verilen anahtar) da geçerliliğini korur.
     */
    sessionKeyHashes: { type: [String], default: [], select: false },

    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },

    /** KYC/KYB doğrulama durumu. 'verified' = admin onaylı (approve-merchant.mjs). */
    kycStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },

    /**
     * v2: Kayıt sırasında `stellarAddress`'in özel anahtarına sahip olunduğu
     * bir imza (`KALEM-MERCHANT-REGISTER:{taxId}:{stellarAddress}` mesajının
     * Ed25519 imzası) ile kanıtlandı mı? `approve-merchant.mjs` bu alan
     * `true` olmadan on-chain kayıt yapmayı REDDEDER (bkz. merchant.routes.js).
     */
    ownershipVerified: {
      type: Boolean,
      default: false,
    },

    /**
     * v2: dtl-token kontratında `register_merchant()` ile GERÇEKTEN
     * kaydedildi mi? Yalnızca `approve-merchant.mjs` başarılı bir on-chain
     * işlemden sonra `true` yapar — bu alan asla API üzerinden doğrudan
     * yazılamaz.
     */
    onChainRegistered: {
      type: Boolean,
      default: false,
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
