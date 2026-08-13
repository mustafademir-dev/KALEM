/**
 * Stellar Horizon SSE (Server-Sent Events) Dinleyici
 *
 * Bölüm 5.5.1-5.5.2: Stellar Horizon API'sinin yerleşik SSE altyapısı
 * üzerinden tek yönlü kalıcı bağlantı kurar. Polling yerine SSE kullanarak
 * gereksiz ağ yükünü ve gecikmeyi önler.
 *
 * İşlem ledger'a yazılıp kapandıktan sonra tetiklenir ve:
 * 1. Gelen işlemi txHash veya memo (idempotencyKey) ile MongoDB'de eşleştirir
 * 2. İşlem durumunu MongoDB'de günceller (status = 'confirmed', ledgerNumber)
 * 3. GİB belge üretim sürecini başlatır (generateGibDocument)
 * 4. İstemciye anlık bildirim gönderir (notifyClient)
 */

import logger from '../utils/logger.js';
import stellarConfig from '../config/stellar.js';
import config from '../config/index.js';
import Transaction from '../models/Transaction.model.js';
import { generateGibDocument } from './gib-simulator.service.js';
import { notifyClient } from './notification.service.js';

/**
 * Gelen SSE işlem kaydını işler ve MongoDB durumunu günceller.
 *
 * @param {object} record - Stellar Horizon transaction kaydı (hash, memo, ledger, vb.).
 * @returns {Promise<object | null>} Güncellenen Transaction kaydı veya null.
 */
export async function handleTransaction(record) {
  try {
    if (!record || !record.hash) {
      logger.warn('[SSE] Geçersiz işlem kaydı alındı.');
      return null;
    }

    const txHash = record.hash;
    const ledgerNumber = record.ledger_attr || record.ledger || 0;
    const memoKey = record.memo || record.memo_bytes || null;

    logger.info(`[SSE] Yeni zincir içi işlem algılandı: ${txHash} (Ledger: ${ledgerNumber})`);

    // MongoDB'de işlemi arayalım: txHash, idempotencyKey veya memo ile eşleştirme
    const queryConditions = [{ txHash }];
    if (memoKey) {
      queryConditions.push({ idempotencyKey: memoKey });
    }

    const transaction = await Transaction.findOne({ $or: queryConditions });

    if (!transaction) {
      logger.info(`[SSE] İşlem MongoDB kaydıyla eşleşmedi (Sistem dışı transfer olabilir): ${txHash}`);
      return null;
    }

    // İşlem durumunu güncelleyelim
    transaction.status = 'confirmed';
    transaction.txHash = txHash;
    transaction.ledgerNumber = ledgerNumber;
    await transaction.save();

    logger.info(`[SSE] İşlem onaylandı (ID: ${transaction._id}, TxHash: ${txHash})`);

    // GİB Belge Taslağını Tetikle (5.5.3)
    try {
      const gibDoc = await generateGibDocument({
        txHash: transaction.txHash,
        transactionId: transaction._id,
        merchantTaxId: transaction.merchantId?.toString() || 'VKN-SIMULATED',
        totalAmountTL: transaction.totalAmount,
        cartItems: [], // Sepet detayları transaction ile gelir
      });

      if (gibDoc) {
        transaction.gibDocumentId = gibDoc._id;
        await transaction.save();
      }
    } catch (gibErr) {
      logger.error(`[SSE] GİB belge üretimi tetikleme hatası: ${gibErr.message}`);
    }

    // İstemciye bildirim gönder
    try {
      await notifyClient({
        merchantId: transaction.merchantId,
        txHash: transaction.txHash,
        status: 'confirmed',
        distribution: {
          pool1Amount: transaction.pool1Amount,
          pool3Amount: transaction.pool3Amount,
          pool4Amount: transaction.pool4Amount,
        },
      });
    } catch (notifyErr) {
      logger.error(`[SSE] İstemci bildirimi hatası: ${notifyErr.message}`);
    }

    return transaction;
  } catch (error) {
    logger.error(`[SSE] handleTransaction hatası: ${error.message}`);
    throw error;
  }
}

/**
 * SSE dinleyicisini başlatır.
 *
 * Horizon API /transactions endpoint'ine akış (stream) bağlantısı kurar.
 *
 * @returns {Function | null} Akışı kapatmak için çağrılabilecek 'close' fonksiyonu.
 */
export function startSSEListener() {
  try {
    if (!stellarConfig.horizonServer) {
      logger.warn('[SSE] Horizon sunucusu yapılandırılmadığı için SSE listener başlatılamadı.');
      return null;
    }

    logger.info('[SSE] Stellar Horizon SSE dinleyicisi başlatılıyor...');

    // Havuz 2 (fee sponsor) adresine filtrelenir — her fee-bump'lı işlemin
    // fee_account'ı Havuz 2'dir; Havuz 1 klasik G... adresi olsa da fee-bump'lı
    // işlemler onun işlem listesinde GÖRÜNMEZ (yalnızca operasyon içinde
    // referans edilen adresler Horizon'un per-account tx listesine girer,
    // fee_account girmez). Gerçek testnet doğrulaması: Madde 3'teki 3 fee-bump
    // tx'i (db93848d..., c6e42c..., a36ffaa9...) Havuz 2'nin işlem listesinde
    // görünürken Havuz 1'in listesinde HİÇBİRİ görünmüyordu (bkz. HANDOFF Bölüm 9).
    const poolAddress = config.pools?.pool2Address;
    let callBuilder = stellarConfig.horizonServer.transactions();

    if (poolAddress) {
      callBuilder = callBuilder.forAccount(poolAddress);
    }

    const closeStream = callBuilder
      .cursor('now')
      .stream({
        onmessage: (record) => {
          handleTransaction(record).catch((err) => {
            logger.error(`[SSE] Asenkron işlem işleme hatası: ${err.message}`);
          });
        },
        onerror: (error) => {
          logger.error(`[SSE] Akış hatası oluştu: ${error?.message || error}`);
        },
      });

    logger.info('[SSE] SSE dinleyicisi başarıyla aktif edildi.');
    return closeStream;
  } catch (error) {
    logger.error(`[SSE] startSSEListener hatası: ${error.message}`);
    throw error;
  }
}
