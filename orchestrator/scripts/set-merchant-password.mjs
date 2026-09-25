#!/usr/bin/env node
/**
 * Esnafa giriş şifresi atar / sıfırlar (operatör aracı).
 *
 * Kullanım:
 *   node scripts/set-merchant-password.mjs --taxId=<VKN> --password=<şifre>
 *
 * Şifre kayıt sırasında belirlenmemiş (eski) esnaflar ya da unutulan şifreler için.
 * Şifre yalnızca scrypt özeti olarak saklanır.
 */
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import Merchant from '../src/models/Merchant.model.js';
import { hashSecret } from '../src/utils/credentials.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.match(/^--([^=]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]])
);
if (!args.taxId || !args.password || args.password.length < 6) {
  console.error('Kullanım: --taxId=<VKN> --password=<en az 6 karakter>');
  process.exit(1);
}

await mongoose.connect(config.mongodbUri);
const res = await Merchant.updateOne(
  { taxId: args.taxId },
  { $set: { passwordHash: hashSecret(args.password), failedLoginCount: 0, lockedUntil: null } }
);
console.log(res.matchedCount ? `Şifre ayarlandı (VKN: ${args.taxId}).` : `Esnaf bulunamadı (VKN: ${args.taxId}).`);
await mongoose.disconnect();
