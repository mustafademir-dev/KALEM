#!/usr/bin/env node
/**
 * Müşteriye yeni PIN atar (operatör aracı).
 *
 * Kullanım:
 *   node scripts/set-customer-pin.mjs --tc=<TC kimlik no> --pin=<6 hane> [--newTc=<yeni TC>]
 *
 * Hesap, TC'nin sunucu anahtarlı özetiyle (CUSTOMER_ID_HASH_SECRET) bulunur; bu
 * anahtar canlı sunucudakiyle aynı olmalıdır, aksi halde hesap bulunamaz.
 * PIN yalnızca scrypt özeti olarak saklanır; deneme kilidi sıfırlanır.
 */
import mongoose from 'mongoose';
import config from '../src/config/index.js';
import Customer from '../src/models/Customer.model.js';
import { hashSecret, hashTcKimlik, isValidTcKimlik } from '../src/utils/credentials.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => a.match(/^--([^=]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]])
);
if (!isValidTcKimlik(args.tc) || !/^\d{6}$/.test(args.pin ?? '')) {
  console.error('Kullanım: --tc=<geçerli TC> --pin=<6 haneli PIN>');
  process.exit(1);
}

if (args.newTc !== undefined && !isValidTcKimlik(args.newTc)) {
  console.error('--newTc geçerli bir TC kimlik numarası değil.');
  process.exit(1);
}

await mongoose.connect(config.mongodbUri);
const update = { pinHash: hashSecret(args.pin), failedLoginCount: 0, lockedUntil: null };
if (args.newTc) {
  // İsteğe bağlı: hesabın TC'sini değiştir. Yeni TC başka hesapta varsa hiçbir şey yapılmaz.
  const newHash = hashTcKimlik(args.newTc);
  if (await Customer.exists({ tcHash: newHash })) {
    console.error('Yeni TC başka bir hesapta kayıtlı; hiçbir şey değiştirilmedi.');
    await mongoose.disconnect();
    process.exit(1);
  }
  update.tcHash = newHash;
}
const res = await Customer.updateOne({ tcHash: hashTcKimlik(args.tc) }, { $set: update });
console.log(
  res.matchedCount
    ? `PIN değiştirildi${args.newTc ? ', TC güncellendi' : ''}.`
    : 'Bu TC ile hesap bulunamadı (CUSTOMER_ID_HASH_SECRET canlıdakiyle aynı mı?).'
);
await mongoose.disconnect();
