/**
 * Müşteri Fiş Arşivi — depolama katmanı.
 *
 * Saf mantık `utils/receiptArchive.js`'tedir (sıralama, tekrar engelleme,
 * boyut sınırı, metne çevirme); burada yalnızca cihaz deposuna okuma/yazma
 * yapılır. Depo, cüzdan anahtarıyla AYNI katmandır (`utils/storage.js`):
 * native'de SecureStore, web'de localStorage.
 *
 * TASARIM KURALI: bu dosyadaki hiçbir fonksiyon HATA FIRLATMAZ. Arşiv bir
 * kolaylıktır; deposu dolu/bozuk/erişilemez olsa bile ödeme akışını ve fiş
 * görüntülemeyi ASLA bozmamalıdır. Hata durumunda `recordReceipt` false,
 * `listReceipts` boş liste döner.
 */

import storage from '../utils/storage.js';
import {
  applyRefunds,
  archiveKey,
  mergeServerReceipts,
  packArchive,
  parseArchive,
  upsertEntry,
} from '../utils/receiptArchive.js';

/**
 * Cüzdana ait fiş listesini okur (yeniden eskiye sıralı).
 *
 * @param {string} stellarAddress
 * @returns {Promise<Array<{txHash: string, totalAmount?: string, businessName?: string, paidAt: string}>>}
 */
export async function listReceipts(stellarAddress) {
  if (!stellarAddress) return [];
  try {
    return parseArchive(await storage.getItemAsync(archiveKey(stellarAddress)));
  } catch {
    return [];
  }
}

/**
 * Başarılı bir ödemeyi arşive ekler. Aynı işlem iki kez kaydedilse de listede
 * bir kez görünür (`upsertEntry` tekrarı engeller).
 *
 * @param {object} params
 * @param {string} params.stellarAddress - Ödeyen cüzdan (arşivin sahibi).
 * @param {string} params.txHash - Zincirdeki işlem hash'i.
 * @param {string} [params.totalAmount] - Stroop cinsinden tutar (listede gösterim için).
 * @param {string} [params.businessName] - QR'dan gelen işletme adı (listede gösterim için).
 * @param {string} [params.paidAt] - ISO tarih; verilmezse şimdi.
 * @returns {Promise<boolean>} Kaydedildiyse true (hata durumunda false).
 */
export async function recordReceipt({ stellarAddress, txHash, totalAmount, businessName, paidAt }) {
  if (!stellarAddress || !txHash) return false;
  try {
    const key = archiveKey(stellarAddress);
    const current = parseArchive(await storage.getItemAsync(key));
    const next = upsertEntry(current, {
      txHash,
      totalAmount,
      businessName,
      paidAt: paidAt ?? new Date().toISOString(),
    });
    await storage.setItemAsync(key, packArchive(next).json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sunucudaki fiş geçmişini arşive ekler ve kaydeder. Hata fırlatmaz.
 *
 * @returns {Promise<Array>} Güncel liste.
 */
export async function syncServerReceipts(stellarAddress, receipts) {
  try {
    const key = archiveKey(stellarAddress);
    const merged = mergeServerReceipts(parseArchive(await storage.getItemAsync(key)), receipts, stellarAddress);
    const { json, kept } = packArchive(merged);
    await storage.setItemAsync(key, json);
    return kept;
  } catch {
    return listReceipts(stellarAddress);
  }
}

/**
 * Sunucudan gelen iadeleri arşive işler ve kaydeder.
 *
 * @returns {Promise<{items: Array, newly: Array}>} Güncel liste ve ilk kez görülen iadeler.
 */
export async function syncRefunds(stellarAddress, refunds) {
  try {
    const key = archiveKey(stellarAddress);
    const { list, newly } = applyRefunds(parseArchive(await storage.getItemAsync(key)), refunds);
    if (newly.length > 0) await storage.setItemAsync(key, packArchive(list).json);
    return { items: list, newly };
  } catch {
    return { items: await listReceipts(stellarAddress), newly: [] };
  }
}

/**
 * Cüzdanın fiş arşivini tamamen siler. Fişlerin KENDİSİ sunucuda kalır; bu
 * yalnızca cihazdaki listeyi temizler.
 *
 * @param {string} stellarAddress
 * @returns {Promise<boolean>}
 */
export async function clearReceipts(stellarAddress) {
  if (!stellarAddress) return false;
  try {
    await storage.deleteItemAsync(archiveKey(stellarAddress));
    return true;
  } catch {
    return false;
  }
}
