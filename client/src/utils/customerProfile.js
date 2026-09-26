/**
 * Müşterinin ad soyadı — bankacılık uygulamalarındaki gibi ekranda gösterilmek için
 * cihazda tutulur. Doğruluk kaynağı sunucudaki hesaptır: her giriş/kayıtta oradan
 * gelen değerle yenilenir.
 */
import storage from './storage.js';

const NAME_KEY = 'kalem_customer_name_v1';

export async function loadCustomerName() {
  try {
    return (await storage.getItemAsync(NAME_KEY)) || null;
  } catch {
    return null;
  }
}

/** `null`/boş değer kaydı siler (adı olmayan hesaba geçildiğinde eski ad kalmasın). */
export async function saveCustomerName(name) {
  try {
    if (name) await storage.setItemAsync(NAME_KEY, name);
    else await storage.deleteItemAsync(NAME_KEY);
  } catch {
    // Kaydedilemese de giriş geçerli; ekranda "Hesabım" görünür.
  }
}

/** "Mustafa Demir" → "Mustafa" (selamlama için). */
export function firstName(fullName) {
  return String(fullName ?? '').trim().split(/\s+/)[0] || null;
}
