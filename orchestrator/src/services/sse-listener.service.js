/**
 * Stellar Horizon SSE (Server-Sent Events) Dinleyici
 *
 * Bölüm 5.5.1-5.5.2: Stellar Horizon API'sinin yerleşik SSE altyapısı
 * üzerinden tek yönlü kalıcı bağlantı kurar. Polling yerine SSE kullanarak
 * gereksiz ağ yükünü ve gecikmeyi önler.
 *
 * İşlem ledger'a yazılıp kapandıktan sonra tetiklenir ve:
 * 1. İşlem durumunu MongoDB'de günceller (confirmed)
 * 2. GİB belge üretim sürecini başlatır
 * 3. İstemciye anlık bildirim gönderir
 */

import logger from '../utils/logger.js';
// import stellarConfig from '../config/stellar.js';
// import config from '../config/index.js';
// import { generateGibDocument } from './gib-simulator.service.js';
// import { notifyClient } from './notification.service.js';

/**
 * SSE listener'ı başlatır.
 *
 * Stellar Horizon'ın /transactions endpoint'ine SSE bağlantısı kurar.
 * İlgili hesaplara (Havuz 1, 3, 4) ait işlemleri filtreler.
 *
 * Akış:
 * 1. horizonServer.transactions()
 *      .forAccount(pool1Address)
 *      .cursor('now')
 *      .stream({ onmessage: handleTransaction })
 *
 * 2. handleTransaction(record):
 *    - txHash ile MongoDB'deki Transaction kaydını bul
 *    - status → 'confirmed', ledgerNumber kaydet
 *    - GİB simülasyon belge üretimini tetikle
 *    - İstemciye bildirim gönder
 */
export function startSSEListener() {
  // TODO: Faz 2 Aşama 2.5'te implemente edilecek.
  logger.warn('[SSE] startSSEListener() henüz implemente edilmedi.');
}

/**
 * Gelen SSE event'ini işler.
 *
 * @param {object} record - Stellar Horizon transaction record.
 */
async function handleTransaction(record) {
  // TODO: Faz 2 Aşama 2.5'te implemente edilecek.
  logger.info(`[SSE] İşlem alındı: ${record?.hash ?? 'bilinmeyen'}`);
}
