/**
 * Esnaf Oturum Servisi
 *
 * Esnaf, kendi API anahtarını (kayıt sırasında bir kez gösterilen,
 * `POST /merchants/register` yanıtındaki `apiKey`) ve işyeri ID'sini bu
 * uygulamaya GİRER — kayıt akışı bu iş paketinin kapsamında değil
 * (bkz. proje talebi: "Esnaf: API key girişi").
 *
 * `businessName` yalnızca YEREL bir görünen ad — backend'de bunu esnaf
 * ID'sinden okuyan bir "profil" ucu yok (yalnızca `GET /:id/balance` var,
 * o da businessName döndürmüyor), bu yüzden burada kullanıcı kendi girdiği
 * adı görür.
 */

import { MERCHANT_SESSION_STORAGE_KEY } from '../utils/constants.js';
import storage from '../utils/storage.js';

/**
 * @param {{merchantId: string, apiKey: string, businessName: string}} session
 */
export async function saveMerchantSession(session) {
  await storage.setItemAsync(MERCHANT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

/**
 * @returns {Promise<{merchantId: string, apiKey: string, businessName: string} | null>}
 */
export async function loadMerchantSession() {
  const raw = await storage.getItemAsync(MERCHANT_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearMerchantSession() {
  await storage.deleteItemAsync(MERCHANT_SESSION_STORAGE_KEY);
}
