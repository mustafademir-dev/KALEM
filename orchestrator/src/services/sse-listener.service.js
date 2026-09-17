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
import { recordFlowEvent } from './flow-events.service.js';

/**
 * SSE dinleyicisinin canlılık durumu — `/health` ucu tarafından okunur.
 *
 * NEDEN GEREKLİ: Ücretsiz bulut planlarında servis trafik almadığında uyutulur;
 * uyanınca HTTP tekrar cevap verse bile SSE akışı ölü kalabilir. Bu durumda
 * ödeme zincire yazılır ama onay yakalanmaz ve GİB belgesi HİÇ üretilmez —
 * dışarıdan bakınca "sistem çalışıyor" görünür. Bu durum bilgisi, o sessiz
 * arızayı `/health` üzerinden görünür kılar (bkz. §6.4: kalıcı cursor yok,
 * uyku sırasında kaçan onay kalıcı olarak kaybolur).
 */
const sseState = {
  started: false,
  startedAt: null,
  lastMessageAt: null,
  lastErrorAt: null,
  lastError: null,
  messageCount: 0,
};

/**
 * SSE dinleyicisinin anlık durumunu döner (salt okunur kopya).
 *
 * @returns {{started: boolean, startedAt: string|null, lastMessageAt: string|null,
 *            lastErrorAt: string|null, lastError: string|null, messageCount: number}}
 */
export function getSSEStatus() {
  return { ...sseState };
}

/**
 * Gelen işlem kaydını işler ve MongoDB durumunu günceller.
 *
 * ÜÇ AYRI YOL bu fonksiyonu çağırabilir (bkz. docs §9.9): (1) doğrudan submit
 * yanıtı — Horizon'un senkron `submitTransaction()` cevabı geldiği anda,
 * ARTIK ANA YOL bu; (2) SSE dinleyicisi; (3) mutabakat job'ı (yalnızca 1 ve
 * 2 de başarısız olursa devreye giren gerçek bir emniyet ağı). Üçü de aynı
 * işlem için, neredeyse aynı anda çağrılabilir — bu yüzden "onayı işleme"
 * adımı ATOMİK'tir (`findOneAndUpdate` + `status !== 'confirmed'` filtresi):
 * hangisi önce Mongo'ya varırsa o kazanır, GİB belgesi/akış olayları TAM
 * OLARAK BİR KEZ üretilir. Önceki sürümde bu, okuma+yazma arasında yarışa
 * açık bir "en iyi çaba" bayrağıyla (`firstCatch`) yapılıyordu.
 *
 * @param {object} record - Zincir işlem kaydı (hash, memo, ledger, vb.) —
 *   Horizon SSE kaydı OLABİLİR, ya da doğrudan `{hash, ledger}` (submit yanıtı).
 * @param {object} [opts]
 * @param {'submit_response'|'sse'|'reconciliation'} [opts.source='sse'] -
 *   Onayı kimin yakaladığı (teşhis/log amaçlı).
 * @returns {Promise<object | null>} Güncellenen Transaction kaydı, ya da bu
 *   çağrı KAYBETTİYSE (başka biri zaten yakaladıysa) ya da eşleşme yoksa null.
 */
export async function handleTransaction(record, { source = 'sse' } = {}) {
  try {
    if (!record || !record.hash) {
      logger.warn('[SSE] Geçersiz işlem kaydı alındı.');
      return null;
    }

    const txHash = record.hash;
    const ledgerNumber = record.ledger_attr || record.ledger || 0;
    const memoKey = record.memo || record.memo_bytes || null;

    // MongoDB'de işlemi arayalım: txHash, idempotencyKey veya memo ile eşleştirme
    const queryConditions = [{ txHash }];
    if (memoKey) {
      queryConditions.push({ idempotencyKey: memoKey });
    }

    // ATOMİK "kazanan tek çağrı" garantisi: filtre `status !== 'confirmed'`
    // içerir, yani başka bir yol ZATEN onaylamışsa bu güncelleme HİÇBİR
    // belgeyi eşleştirmez (findOneAndUpdate null döner) — okuma ile yazma
    // arasında pencere YOKTUR, üç yoldan ancak biri buradan geçebilir.
    const transaction = await Transaction.findOneAndUpdate(
      { $or: queryConditions, status: { $ne: 'confirmed' } },
      { $set: { status: 'confirmed', txHash, ledgerNumber } },
      { new: true }
    );

    if (!transaction) {
      // Teşhis için ayrım: hiç eşleşme yok mu, yoksa başka bir yol mu kazandı?
      const alreadyConfirmed = await Transaction.exists({ $or: queryConditions, status: 'confirmed' });
      if (alreadyConfirmed) {
        logger.info(`[SSE] İşlem zaten başka bir yoldan onaylanmış (bu çağrı kaynağı: ${source}), tekrar işlenmiyor: ${txHash}`);
      } else {
        logger.info(`[SSE] İşlem MongoDB kaydıyla eşleşmedi (Sistem dışı transfer olabilir): ${txHash}`);
      }
      return null;
    }

    logger.info(`[SSE] İşlem onaylandı (ID: ${transaction._id}, TxHash: ${txHash}, kaynak: ${source})`);
    recordFlowEvent(transaction._id, 'caught', { data: { source, txHash, ledger: ledgerNumber } });

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
        recordFlowEvent(transaction._id, 'gib', {
          data: {
            gibDocumentId: gibDoc._id?.toString() ?? null,
            documentType: gibDoc.documentType ?? null,
            status: gibDoc.status ?? null,
            // GİB'e gerçek gönderim yok — belge UBL-TR taslağı olarak üretilir (§GERCEK_VS_SIMULASYON).
            simulated: true,
          },
        });
      }
    } catch (gibErr) {
      logger.error(`[SSE] GİB belge üretimi tetikleme hatası: ${gibErr.message}`);
      recordFlowEvent(transaction._id, 'gib', { status: 'failed', data: { error: gibErr.message } });
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
      sseState.started = false;
      sseState.lastError = 'Horizon sunucusu yapılandırılmamış.';
      sseState.lastErrorAt = new Date().toISOString();
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
          sseState.lastMessageAt = new Date().toISOString();
          sseState.messageCount += 1;
          handleTransaction(record, { source: 'sse' }).catch((err) => {
            logger.error(`[SSE] Asenkron işlem işleme hatası: ${err.message}`);
          });
        },
        onerror: (error) => {
          sseState.lastErrorAt = new Date().toISOString();
          sseState.lastError = String(error?.message || error);
          logger.error(`[SSE] Akış hatası oluştu: ${error?.message || error}`);
        },
      });

    sseState.started = true;
    sseState.startedAt = new Date().toISOString();
    logger.info('[SSE] SSE dinleyicisi başarıyla aktif edildi.');
    return closeStream;
  } catch (error) {
    logger.error(`[SSE] startSSEListener hatası: ${error.message}`);
    throw error;
  }
}
