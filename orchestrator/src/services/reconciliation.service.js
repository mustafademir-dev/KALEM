/**
 * Mutabakat (Reconciliation) Servisi — GERÇEK BİR EMNİYET AĞI, ANA YOL DEĞİL
 *
 * §6.4'te belgelenen açığı kapatır: onay yakalama TEK ve kırılgan bir SSE
 * akışına bağlıydı; akış ölürse veya süreç yeniden başlarsa o pencerede
 * zincire yazılan onay **kalıcı olarak** kaybolur, işlem sonsuza kadar
 * `submitted` durumunda takılı kalır ve GİB belgesi HİÇ üretilmez.
 *
 * ## Neden gerekli olduğu gerçek bir arızayla kanıtlandı (12 Eylül 2026)
 *
 * Render'daki canlı dağıtımda uçtan uca prova sırasında: ödeme gerçekten
 * zincire yazıldı (tx `b5466573…`, Havuz 2 ücreti ödedi, esnaf 2.49 dTL aldı),
 * ancak SSE dinleyicisi `started: true` görünmesine rağmen **hiç mesaj almadı**
 * (`messageCount: 0`, `lastError: null`) ve GİB belgesi üretilmedi. Aynı kod,
 * aynı filtre ve aynı Horizon ile YERELDE sorunsuz çalıştı — yani sorun kodda
 * değil, çalıştığı ortamda.
 *
 * ## §9.9 güncellemesi (17 Eylül 2026) — artık ANA YOL DEĞİL
 *
 * O tarihe kadar bu job, onayı (canlı işlem akışının 7. adımı) FİİLEN
 * yakalayan taraftı (10 sn'lik döngüde) — SSE canlıda güvenilmediği için.
 * Bu, uçtan uca 15-20 saniyelik gereksiz bir gecikmeye yol açıyordu: Horizon'un
 * `submitTransaction()` çağrısı ZATEN SENKRON'dur (işlem ledger'a yazılana
 * kadar bekler, hash+ledger'ı döner) — onay bilgisi `submitTransactionHandler`
 * içinde ZATEN elimizdeydi, kullanılmıyordu. Artık `submitTransactionHandler`
 * bu bilgiyi `handleTransaction()`'a DOĞRUDAN, anında iletiyor (bkz.
 * transaction.routes.js). Bu job artık yalnızca "doğrudan çağrı da SSE de
 * başarısız oldu" nadir durumu için devrede kalan GERÇEK bir emniyet ağıdır —
 * bu yüzden `RECONCILIATION_CRON`/`RECONCILIATION_MIN_AGE_MS` tekrar
 * gevşetildi (30 sn / 20 sn, bkz. render.yaml).
 *
 * ## Nasıl çalışır
 *
 * Periyodik olarak `submitted` durumunda ve belirli bir yaştan eski işlemleri
 * bulur, her biri için Horizon'a **tekil** sorgu atar ve zincirde başarılıysa
 * `handleTransaction()`'ı çağırır — onay/GİB/bildirim mantığı doğrudan-çağrı
 * ve SSE yollarıyla BİREBİR AYNI kod yolundan geçer, kopyalanmaz. Üç yoldan
 * hangisi önce varırsa `handleTransaction`'daki atomik `findOneAndUpdate` onu
 * kazanan ilan eder; bu job geç kalırsa (normal ve beklenen durum) sessizce
 * hiçbir şey yapmadan çıkar.
 *
 * Tasarım notları:
 * - `MIN_AGE_MS`: çok taze işlemler atlanır; doğrudan çağrıya/SSE'ye önce
 *   şans verilir, böylece normal akışta gereksiz Horizon sorgusu yapılmaz.
 * - `MAX_BATCH`: tek turda sorgulanacak işlem sayısı sınırlıdır — geçmişte
 *   birikmiş çok sayıda kayıt Horizon'u aniden yüklemesin diye.
 * - Zincirde bulunamayan (404) işlem `submitted` bırakılır: henüz onaylanmamış
 *   olabilir. Bir sonraki turda tekrar denenir.
 * - Zincirde BAŞARISIZ görünen işlem `failed` olarak kapatılır; aksi halde
 *   sonsuza kadar sorgulanmaya devam ederdi.
 */

import cron from 'node-cron';
import Transaction from '../models/Transaction.model.js';
import stellarConfig from '../config/stellar.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { handleTransaction } from './sse-listener.service.js';

/**
 * Bu yaştan genç işlemler atlanır — önce doğrudan çağrıya/SSE'ye şans ver.
 * Env: `RECONCILIATION_MIN_AGE_MS` (varsayılan 20 sn, render.yaml'da da 20 sn —
 * artık hız-kritik değil, bkz. dosya başı §9.9 notu).
 */
const MIN_AGE_MS = config.reconciliation.minAgeMs;

/** Tek turda en fazla kaç işlem sorgulanır. */
const MAX_BATCH = 20;

/**
 * Horizon'dan tek bir işlemi sorgular.
 *
 * @param {string} txHash
 * @returns {Promise<{found: boolean, successful?: boolean, ledger?: number}>}
 */
async function fetchTransactionFromHorizon(txHash) {
  try {
    const tx = await stellarConfig.horizonServer.transactions().transaction(txHash).call();
    // DİKKAT: Horizon SDK yanıtında `tx.ledger` bir FONKSİYONDUR (ilgili ledger'ı
    // çeken link takipçisi), sayı değil. Ledger numarası `ledger_attr`'dadır —
    // `sse-listener.js`'teki `record.ledger_attr || record.ledger` sırası da
    // aynı nedenle böyledir. Yanlış sırada okunursa fonksiyon nesnesi
    // `ledgerNumber` alanına yazılmaya çalışılır ve Mongoose cast hatası verir.
    const ledger = typeof tx.ledger_attr === 'number' ? tx.ledger_attr : Number(tx.ledger_attr) || 0;
    return { found: true, successful: tx.successful !== false, ledger };
  } catch (error) {
    // 404: işlem henüz ledger'a girmemiş olabilir — hata değil, "henüz yok".
    const status = error?.response?.status ?? error?.status;
    if (status === 404) return { found: false };
    throw error;
  }
}

/**
 * `submitted` durumunda takılı kalmış işlemleri Horizon'dan doğrulayıp kapatır.
 *
 * @returns {Promise<{checked: number, confirmed: number, failed: number, pending: number}>}
 */
export async function reconcilePendingTransactions() {
  const stats = { checked: 0, confirmed: 0, failed: 0, pending: 0 };

  if (!stellarConfig.horizonServer) {
    logger.warn('[Reconcile] Horizon yapılandırılmamış, mutabakat atlandı.');
    return stats;
  }

  const cutoff = new Date(Date.now() - MIN_AGE_MS);
  const stuck = await Transaction.find({
    status: 'submitted',
    txHash: { $ne: null },
    updatedAt: { $lt: cutoff },
  })
    .sort({ updatedAt: 1 })
    .limit(MAX_BATCH);

  if (stuck.length === 0) return stats;

  logger.info(`[Reconcile] ${stuck.length} adet 'submitted' işlem kontrol edilecek.`);

  for (const transaction of stuck) {
    stats.checked += 1;
    try {
      const result = await fetchTransactionFromHorizon(transaction.txHash);

      if (!result.found) {
        stats.pending += 1;
        continue; // henüz ledger'da yok, sonraki turda tekrar denenecek
      }

      if (!result.successful) {
        transaction.status = 'failed';
        transaction.errorMessage = 'Zincirde başarısız olarak bulundu (mutabakat).';
        await transaction.save();
        stats.failed += 1;
        logger.warn(`[Reconcile] İşlem zincirde BAŞARISIZ: ${transaction.txHash}`);
        continue;
      }

      // Onay/GİB/bildirim mantığı SSE yolundakiyle AYNI fonksiyondan geçer.
      await handleTransaction(
        { hash: transaction.txHash, ledger: result.ledger },
        { source: 'reconciliation' }
      );
      stats.confirmed += 1;
      logger.info(
        `[Reconcile] SSE'nin kaçırdığı onay yakalandı ve işlendi: ${transaction.txHash}`
      );
    } catch (error) {
      logger.error(`[Reconcile] ${transaction.txHash} kontrol hatası: ${error.message}`);
    }
  }

  if (stats.confirmed > 0 || stats.failed > 0) {
    logger.info(
      `[Reconcile] Tur tamamlandı — kontrol: ${stats.checked}, onaylandı: ${stats.confirmed}, ` +
        `başarısız: ${stats.failed}, beklemede: ${stats.pending}`
    );
  }
  return stats;
}

/**
 * Mutabakat cron job'ını başlatır.
 *
 * @returns {import('node-cron').ScheduledTask | null}
 */
export function startReconciliationCron() {
  const expression = config.reconciliation.cronExpression;

  if (!config.reconciliation.enabled) {
    logger.warn('[Reconcile] Mutabakat job\'ı devre dışı (RECONCILIATION_ENABLED=false).');
    return null;
  }

  // 10 sn'lik aralıkta yavaş bir Horizon turu bir sonrakiyle çakışabilir; çakışan
  // iki tur aynı işlemi iki kez işleyip İKİ GİB belgesi üretirdi. Tur sürerken
  // gelen tetik atlanır.
  let running = false;
  const task = cron.schedule(expression, () => {
    if (running) return;
    running = true;
    reconcilePendingTransactions()
      .catch((err) => {
        logger.error(`[Reconcile] Tur hatası: ${err.message}`);
      })
      .finally(() => {
        running = false;
      });
  });

  logger.info(`[Reconcile] Mutabakat job'ı başlatıldı (${expression}).`);
  return task;
}
