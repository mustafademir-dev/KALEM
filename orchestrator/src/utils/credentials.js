/**
 * Giriş bilgileri: şifre/PIN saklama, TC kimlik doğrulama ve deneme kilidi.
 *
 * - Şifre ve PIN yalnızca scrypt özeti olarak saklanır (tuzlu, yavaş).
 * - TC kimlik numarası veritabanında AÇIK HÂLDE TUTULMAZ: sunucu gizli
 *   anahtarıyla HMAC-SHA256 özeti saklanır. Aynı TC hep aynı özete gider
 *   (girişte arama yapılabilsin diye), ama özetten TC'ye dönülemez ve gizli
 *   anahtar olmadan sözlük saldırısı yapılamaz.
 */

import crypto from 'node:crypto';
import config from '../config/index.js';

const SCRYPT_KEYLEN = 32;

/** Şifre/PIN'i `scrypt$<tuz>$<özet>` biçiminde saklanacak hâle getirir. */
export function hashSecret(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(plain), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Sabit sürede karşılaştırır; bozuk kayıtta false döner. */
export function verifySecret(plain, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(String(plain), Buffer.from(parts[1], 'hex'), expected.length);
  return expected.length > 0 && crypto.timingSafeEqual(expected, actual);
}

/** TC kimlik numarası biçim ve sağlama kontrolü (11 hane, ilki 0 değil, 10. ve 11. hane kuralı). */
export function isValidTcKimlik(tc) {
  const s = String(tc ?? '');
  if (!/^[1-9]\d{10}$/.test(s)) return false;
  const d = [...s].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/** TC'nin saklanan özeti. Gizli anahtar yoksa hata fırlatır (açık TC saklamaya düşülmez). */
export function hashTcKimlik(tc) {
  const secret = config.secrets.customerIdHashSecret;
  if (!secret) throw new Error('CUSTOMER_ID_HASH_SECRET yapılandırılmamış.');
  return crypto.createHmac('sha256', secret).update(String(tc)).digest('hex');
}

// --- Deneme kilidi -----------------------------------------------------------------

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;

/** Kilitliyse kalan dakika, değilse 0. */
export function lockedMinutesLeft(account, now = Date.now()) {
  const until = account?.lockedUntil ? new Date(account.lockedUntil).getTime() : 0;
  return until > now ? Math.ceil((until - now) / 60000) : 0;
}

/** Hatalı denemeyi işler; eşik aşılınca hesabı kilitler. Kaydeder. */
export async function registerFailedLogin(account) {
  account.failedLoginCount = (account.failedLoginCount ?? 0) + 1;
  if (account.failedLoginCount >= MAX_FAILED_LOGINS) {
    account.lockedUntil = new Date(Date.now() + LOCK_MS);
    account.failedLoginCount = 0;
  }
  await account.save();
}

/** Başarılı girişte sayaçları sıfırlar (değişiklik yoksa yazmaz). */
export async function clearFailedLogins(account) {
  if (account.failedLoginCount || account.lockedUntil) {
    account.failedLoginCount = 0;
    account.lockedUntil = null;
    await account.save();
  }
}
