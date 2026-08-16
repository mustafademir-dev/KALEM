/**
 * Esnaf Oturum Servisi
 *
 * Esnaf, kendi API anahtarını (kayıt sırasında bir kez gösterilen,
 * `POST /merchants/register` yanıtındaki `apiKey`) ve işyeri ID'sini
 * ya bu uygulamadaki Kayıt formuyla ELDE EDER ya da (önceden başka bir
 * yerde kaydolmuşsa) doğrudan Giriş formuna GİRER.
 *
 * `businessName` yalnızca YEREL bir görünen ad — backend'de bunu esnaf
 * ID'sinden okuyan bir "profil" ucu yok (yalnızca `GET /:id/balance` var,
 * o da businessName döndürmüyor), bu yüzden burada kullanıcı kendi girdiği
 * adı görür.
 */

import nacl from 'tweetnacl';
import * as StellarSdk from '@stellar/stellar-sdk';
import { MERCHANT_SESSION_STORAGE_KEY } from '../utils/constants.js';
import storage, { bytesToBase64 } from '../utils/storage.js';

/**
 * Esnaf KAYDI sırasında adres-sahipliği kanıtı imzalamak için GEÇİCİ bir
 * Ed25519 keypair üretir. DİKKAT: bu keypair HİÇBİR YERE KAYDEDİLMEZ
 * (ne SecureStore'a ne backend'e) — yalnızca bu tek işlem için bellekte
 * kullanılıp atılır. Esnaf, kayıt sonrası bu adresle bir daha HİÇBİR ŞEY
 * imzalamaz (kontrat seviyesinde `MerchantCannotSend` zaten esnafın bu
 * adresten dTL göndermesini engelliyor) — yalnızca ALICI kimliği olarak
 * kullanılır, bu yüzden özel anahtarı saklamaya gerek yoktur.
 *
 * @returns {{stellarAddress: string, sign: (data: Uint8Array) => Uint8Array}}
 */
export function generateEphemeralMerchantKeypair() {
  const keyPair = nacl.sign.keyPair();
  const stellarAddress = StellarSdk.StrKey.encodeEd25519PublicKey(Buffer.from(keyPair.publicKey));
  return {
    stellarAddress,
    sign: (data) => nacl.sign.detached(data, keyPair.secretKey),
  };
}

export { bytesToBase64 };

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
