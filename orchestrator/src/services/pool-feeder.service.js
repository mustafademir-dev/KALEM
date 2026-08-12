/**
 * Havuz 4 -> Havuz 2 Besleme Servisi (Pool Feeder)
 *
 * Bölüm 5.3.1 — Güncellenmiş akış (AMM/Path Payment YOK):
 *
 * 1. Cron job periyodik olarak Havuz 2'nin XLM bakiyesini kontrol eder
 * 2. Bakiye eşiğin altındaysa:
 *    a. Havuz 4'teki dTL komisyon gelirini ihraççı doğrudan yakar (burn)
 *    b. İhraççı, yakılan dTL'nin TL karşılığını OFF-CHAIN kontrollü
 *       kurla XLM'e çevirir (kendi hazine/borsa hesapları üzerinden)
 *    c. Temin edilen XLM, Havuz 2'ye enjekte edilir
 *
 * DİKKAT: Adım (b) off-chain bir süreçtir. Bu servis yalnızca (a)'yı
 * (zincir üstü) ve (c)'nin on-chain kısmını (XLM transferi) orkestre
 * eder. Kur dönüşümü (b) bu sistemin dışındadır.
 *
 * MİMARİ NOT (bilinçli sapma, rapor Bölüm 5.3.1 ile karşılaştırıldığında):
 * Rapor "Havuz 4 -> ihraççı transfer -> burn" akışını tarif eder. Bu akış
 * kontrat seviyesinde YÜRÜTÜLEMEZ:
 *   - dtl-token.transfer() alıcının kayıtlı 4 havuzdan biri olmasını
 *     zorunlu kılar (pool_registry.rs, is_authorized_recipient). İhraççı/
 *     admin havuz DEĞİLDİR -> transfer() UnauthorizedRecipient (#2) ile
 *     panic eder (token.rs:265-267).
 *   - transfer() ayrıca from.require_auth() ister (token.rs:257).
 *     Orkestrasyonda Havuz 4'ün KENDİ imza anahtarı YOKTUR — yalnızca
 *     Havuz 2 (POOL2_SECRET_KEY) ve ihraççı (ISSUER_SECRET_KEY)
 *     anahtarları tutulur.
 * Bu iki sebepten, rapordaki ara adım (ihraççının dTL'ye geçici
 * transfer yoluyla sahip olması) zincirde imkansızdır. Bunun yerine
 * transfer adımı ATLANIR: ihraççı dtl-token.burn(from=Havuz4Adresi,
 * amount) fonksiyonunu DOĞRUDAN çağırır. burn() from.require_auth()
 * İSTEMEZ — yalnızca çağıranın admin olduğunu doğrular
 * (auth.rs:require_admin, "caller.require_auth()" admin için, from için
 * DEĞİL). Bu nedenle tek admin imzası yeterlidir.
 * Ekonomik sonuç raporla birebir aynıdır: Havuz 4 bakiyesi ve toplam dTL
 * arzı aynı miktarda azalır. Fark yalnızca ara transfer event'inin
 * oluşmamasıdır (muhasebe izi burn event'i üzerinden takip edilir).
 * Kontrat DEĞİŞTİRİLMEMİŞ/redeploy EDİLMEMİŞTİR — testnet'te doğrulanmış
 * adresler ve 31 birim test korunmuştur. Bu sapma ayrıca
 * docs/ARCHITECTURE_DECISIONS.md ("Bilinen Sapmalar ve Implementasyon
 * Notları") ve docs/HANDOFF_TO_CLAUDE_CODE.md'de belgelenmiştir — bu
 * dosya ile o belgeler arasında bir TUTARSIZLIK YOKTUR, bilinçli ve
 * onaylanmış bir tasarım kararıdır.
 *
 * DEMO_MODE NOTU: XLM enjeksiyonu (adım c) varsayılan olarak MANUELDİR
 * (DEMO_MODE=false) — off-chain dönüşüm gerçekten tamamlanana kadar
 * PoolFeed kaydı 'awaiting_offchain' durumunda bekler ve loglarda
 * "MANUEL ONAY BEKLENİYOR" damgası görünür. DEMO_MODE=true iken (yalnızca
 * canlı sunum/demo amaçlı) POOL_FEEDER_DEMO_DTL_PER_XLM sabit kuruyla
 * enjeksiyon OTOMATİK yapılır ve loglarda/PoolFeed.exchangeRateNote
 * alanında "SİMÜLE KUR (DEMO_MODE)" damgası taşınır — hangi modda
 * çalışıldığı hiçbir zaman belirsiz kalmaz. İki mod da AYNI kod yolunu
 * kullanır (bkz. convertDtlToXlm), yalnızca config ile dallanır.
 */

import cron from 'node-cron';
import * as StellarSdk from '@stellar/stellar-sdk';
import PoolFeed from '../models/PoolFeed.model.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import stellarConfig from '../config/stellar.js';
import { loadAccount, buildContractCall, submitTransaction } from './stellar-tx.service.js';

/** Aynı süreç içinde çakışan cron tick'lerini engelleyen ucuz ön-filtre. */
let feedCycleRunning = false;

/**
 * Havuz 2 XLM bakiyesini kontrol eder.
 *
 * @returns {Promise<number>} Havuz 2'nin mevcut XLM bakiyesi.
 */
export async function checkPool2Balance() {
  try {
    if (!config.pools.pool2Address) {
      throw new Error('Havuz 2 adresi yapılandırılmamış (POOL2_ADDRESS).');
    }

    const account = await loadAccount(config.pools.pool2Address);
    const nativeEntry = (account.balances || []).find((b) => b.asset_type === 'native');

    if (!nativeEntry) {
      logger.warn('[PoolFeeder] Havuz 2 hesabında native XLM bakiyesi bulunamadı.');
      return 0;
    }

    const balance = parseFloat(nativeEntry.balance);
    if (!Number.isFinite(balance)) {
      logger.warn(`[PoolFeeder] Havuz 2 bakiyesi sayıya çevrilemedi: ${nativeEntry.balance}`);
      return 0;
    }

    // Harcanabilir bakiye = toplam - minimum rezerv - satış yükümlülükleri
    const reserve = (2 + (account.subentry_count || 0)) * 0.5;
    const liabilities = parseFloat(nativeEntry.selling_liabilities || '0') || 0;
    const spendable = Math.max(0, balance - reserve - liabilities);

    logger.info(`[PoolFeeder] Havuz 2 XLM bakiyesi: ${balance} (harcanabilir: ${spendable.toFixed(7)})`);
    return config.poolFeeder.useSpendableBalance ? spendable : balance;
  } catch (error) {
    logger.error(`[PoolFeeder] checkPool2Balance hatası: ${error.message}`);
    throw error;
  }
}

/**
 * Havuz 4'ün dTL bakiyesini salt-okunur simülasyonla (maliyetsiz) sorgular.
 *
 * dtl-token.balance() bir view fonksiyonudur; tam invoke gönderilmesi
 * gereksiz ağ ücreti ve ledger yazımı üretir. Bu nedenle
 * sorobanServer.simulateTransaction() kullanılır — ağa hiçbir işlem
 * gönderilmez ve Horizon'dan hesap yüklenmesi bile gerekmez (Account
 * nesnesi yerel kurulur, sequence numarası gerekmez).
 *
 * @returns {Promise<string>} Havuz 4 dTL bakiyesi (stroops, string).
 */
export async function readPool4DtlBalance() {
  try {
    if (!stellarConfig.sorobanServer) {
      throw new Error('Soroban RPC sunucusu yapılandırılmamış.');
    }
    if (!config.secrets.issuerSecretKey) {
      throw new Error('İhraççı gizli anahtarı yapılandırılmamış (ISSUER_SECRET_KEY).');
    }

    const issuerKeypair = StellarSdk.Keypair.fromSecret(config.secrets.issuerSecretKey);

    // Simülasyon gerçek sequence numarası gerektirmez -> Horizon çağrısı YOK
    const simulationAccount = new StellarSdk.Account(issuerKeypair.publicKey(), '0');

    const contract = new StellarSdk.Contract(config.contracts.dtlTokenId);
    const readTx = new StellarSdk.TransactionBuilder(simulationAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(contract.call('balance', StellarSdk.Address.fromString(config.pools.pool4Address).toScVal()))
      .setTimeout(30)
      .build();

    const simulation = await stellarConfig.sorobanServer.simulateTransaction(readTx);

    if (!StellarSdk.rpc.Api.isSimulationSuccess(simulation)) {
      throw new Error(`Havuz 4 bakiye simülasyonu başarısız: ${JSON.stringify(simulation.error ?? simulation)}`);
    }

    const rawBalance = StellarSdk.scValToNative(simulation.result.retval); // BigInt (i128)
    const balance = rawBalance.toString();

    logger.info(`[PoolFeeder] Havuz 4 dTL bakiyesi: ${balance} stroops`);
    return balance;
  } catch (error) {
    logger.error(`[PoolFeeder] readPool4DtlBalance hatası: ${error.message}`);
    throw error;
  }
}

/**
 * Havuz 4 bakiyesinden yakılacak tutarı min/max sınırlarına göre belirler.
 *
 * @param {string} pool4Balance - Havuz 4 dTL bakiyesi (stroops).
 * @returns {string | null} Yakılacak tutar (stroops) veya minimum altındaysa null.
 */
export function resolveBurnAmount(pool4Balance) {
  const balance = BigInt(pool4Balance);
  const min = BigInt(config.poolFeeder.minBurnStroops);
  const max = BigInt(config.poolFeeder.maxBurnStroops);

  if (balance < min) {
    return null;
  }
  return (balance > max ? max : balance).toString();
}

/**
 * Havuz 4'teki dTL komisyon gelirini doğrudan yakar (burn).
 *
 * MİMARİ NOT: Rapor 5.3.1'deki "Havuz 4 -> ihraççı transfer -> burn"
 * akışı zincirde yürütülemez (bkz. dosya başı JSDoc). Transfer adımı
 * atlanıp doğrudan burn(from = Havuz 4) çağrılır — dtl-token.burn()
 * yalnızca admin imzası ister, from.require_auth() ÇAĞIRMAZ.
 *
 * @param {string} amount - Yakılacak dTL tutarı (stroops).
 * @returns {Promise<string>} Burn işleminin tx hash'i.
 */
export async function burnPool4Dtl(amount) {
  try {
    if (!amount || BigInt(amount) <= 0n) {
      throw new Error(`Geçersiz burn tutarı: ${amount}`);
    }
    if (!config.secrets.issuerSecretKey) {
      throw new Error('İhraççı gizli anahtarı yapılandırılmamış (ISSUER_SECRET_KEY).');
    }

    const issuerKeypair = StellarSdk.Keypair.fromSecret(config.secrets.issuerSecretKey);

    logger.info(
      `[PoolFeeder] Havuz 4 dTL yakma işlemi hazırlanıyor ` +
        `(kaynak: ${config.pools.pool4Address}, tutar: ${amount} stroops)`
    );

    // prepareTransaction (simulate + assemble) buildContractCall içinde çalışır
    const preparedXdr = await buildContractCall({
      sourceAddress: issuerKeypair.publicKey(),
      contractId: config.contracts.dtlTokenId,
      method: 'burn',
      args: [
        StellarSdk.Address.fromString(config.pools.pool4Address).toScVal(),
        StellarSdk.nativeToScVal(amount, { type: 'i128' }),
      ],
    });

    const burnTx = StellarSdk.TransactionBuilder.fromXDR(preparedXdr, stellarConfig.networkPassphrase);
    burnTx.sign(issuerKeypair);

    const response = await submitTransaction(burnTx);

    logger.info(`[PoolFeeder] Havuz 4 dTL yakıldı (hash: ${response.hash}, tutar: ${amount} stroops)`);
    return response.hash;
  } catch (error) {
    logger.error(`[PoolFeeder] burnPool4Dtl hatası: ${error.message}`);
    throw error;
  }
}

/**
 * Yakılan dTL karşılığı XLM tutarını DEMO_MODE kuruyla hesaplar.
 *
 * DEMO_MODE=false (varsayılan) iken her zaman null döner -> manuel mod.
 * DEMO_MODE=true iken POOL_FEEDER_DEMO_DTL_PER_XLM sabit kuruyla hesaplanır.
 *
 * @param {string} amountStroops - Yakılan dTL (stroops).
 * @returns {string | null} XLM tutarı (7 ondalık, string); manuel modda null.
 */
export function convertDtlToXlm(amountStroops) {
  if (!config.demoMode || !config.poolFeeder.demoDtlPerXlm) {
    return null;
  }
  const dtl = Number(amountStroops) / 1e7;
  const rate = parseFloat(config.poolFeeder.demoDtlPerXlm);
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  return (dtl / rate).toFixed(7);
}

/**
 * Off-chain dönüşüm sonrası XLM'i Havuz 2'ye enjekte eder.
 *
 * `xlmAmount === null` ise (manuel mod) hiçbir ağ çağrısı yapılmadan
 * null döner ve "MANUEL ONAY BEKLENİYOR" loglanır. Aksi halde (DEMO_MODE)
 * ihraççı hesabından Havuz 2'ye native XLM Payment operasyonu gönderilir.
 *
 * @param {string | null} xlmAmount - Enjekte edilecek XLM tutarı (ondalık) veya null.
 * @returns {Promise<string | null>} XLM transfer tx hash'i; manuel modda null.
 */
export async function injectXlmToPool2(xlmAmount) {
  try {
    if (xlmAmount === null) {
      logger.warn(
        '[PoolFeeder] MANUEL ONAY BEKLENİYOR — off-chain XLM temini tamamlanmadan enjeksiyon yapılmaz.'
      );
      return null;
    }

    const amount = Number(xlmAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Geçersiz XLM tutarı: ${xlmAmount}`);
    }
    if (!config.secrets.issuerSecretKey) {
      throw new Error('İhraççı gizli anahtarı yapılandırılmamış (ISSUER_SECRET_KEY).');
    }

    const issuerKeypair = StellarSdk.Keypair.fromSecret(config.secrets.issuerSecretKey);
    const issuerAccount = await loadAccount(issuerKeypair.publicKey());

    const paymentTx = new StellarSdk.TransactionBuilder(issuerAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: config.pools.pool2Address,
          asset: StellarSdk.Asset.native(),
          amount: amount.toFixed(7), // Stellar 7 ondalık basamak zorunluluğu
        })
      )
      .addMemo(StellarSdk.Memo.text('KALEM-POOL2-FEED'))
      .setTimeout(180)
      .build();

    paymentTx.sign(issuerKeypair);
    const response = await submitTransaction(paymentTx);

    logger.info(
      `[PoolFeeder] SİMÜLE KUR (DEMO_MODE): ${amount.toFixed(7)} XLM Havuz 2'ye enjekte edildi (hash: ${response.hash})`
    );
    return response.hash;
  } catch (error) {
    logger.error(`[PoolFeeder] injectXlmToPool2 hatası: ${error.message}`);
    throw error;
  }
}

/**
 * Tek bir besleme döngüsünü çalıştırır (cron tick gövdesi).
 *
 * Akış:
 * 1. Havuz 2 XLM bakiyesini kontrol et; eşiğin üstündeyse hiçbir şey yapma
 * 2. Havuz 4 dTL bakiyesini maliyetsiz simülasyonla oku
 * 3. Yakılacak tutarı min/max sınırlarına göre belirle
 * 4. PoolFeed kaydını 'pending' olarak AÇ (kilit + denetim izi) — burn'den ÖNCE
 * 5. Havuz 4'ten doğrudan burn (transfer adımı yok, bkz. burnPool4Dtl)
 * 6. Off-chain kur dönüşümü: DEMO_MODE değilse 'awaiting_offchain' ile beklet
 * 7. XLM enjeksiyonu ve döngüyü 'completed' olarak kapat
 *
 * @returns {Promise<object | null>} Oluşturulan PoolFeed kaydı veya null.
 */
export async function runPoolFeedCycle() {
  try {
    if (feedCycleRunning) {
      logger.warn('[PoolFeeder] Önceki besleme döngüsü hâlâ sürüyor; bu tick atlanıyor.');
      return null;
    }
    feedCycleRunning = true;

    try {
      const balance = await checkPool2Balance();
      if (balance >= config.pool2XlmThreshold) {
        logger.info(`[PoolFeeder] Havuz 2 eşik üstünde (${balance} >= ${config.pool2XlmThreshold} XLM).`);
        return null;
      }

      logger.info(
        `[PoolFeeder] Havuz 2 eşik altında (${balance} < ${config.pool2XlmThreshold} XLM). Besleme başlatılıyor...`
      );

      const pool4Balance = await readPool4DtlBalance();
      const burnAmount = resolveBurnAmount(pool4Balance);
      if (burnAmount === null) {
        logger.warn(
          `[PoolFeeder] Havuz 4 bakiyesi minimum burn tutarının altında ` +
            `(${pool4Balance} < ${config.poolFeeder.minBurnStroops}). Besleme atlanıyor.`
        );
        return null;
      }

      // KİLİT: açık bir döngü varsa unique index E11000 ile reddeder
      let feed;
      try {
        feed = await PoolFeed.create({
          status: 'pending',
          pool2BalanceBefore: String(balance),
          pool2Threshold: String(config.pool2XlmThreshold),
          pool4DtlBalance: pool4Balance,
          burnAmount,
        });
      } catch (lockError) {
        if (lockError.code === 11000) {
          logger.warn('[PoolFeeder] Zaten açık bir besleme döngüsü var; bu tick atlanıyor.');
          return null;
        }
        throw lockError;
      }

      // Burn başarısız olursa kaydı 'failed' yap (kilit partial filter dışına çıkar)
      let burnTxHash;
      try {
        burnTxHash = await burnPool4Dtl(burnAmount);
      } catch (burnError) {
        feed.status = 'failed';
        feed.errorMessage = burnError.message;
        await feed.save();
        throw burnError;
      }

      feed.burnTxHash = burnTxHash;
      feed.status = 'burn_submitted';
      await feed.save();

      const xlmAmount = convertDtlToXlm(burnAmount);
      if (xlmAmount === null) {
        feed.status = 'awaiting_offchain';
        feed.exchangeRateNote = 'MANUEL ONAY BEKLENİYOR — off-chain TL->XLM dönüşümü tamamlanmadı.';
        await feed.save();
        logger.warn(
          `[PoolFeeder] ${burnAmount} stroops dTL yakıldı (hash: ${burnTxHash}). ` +
            `XLM temini off-chain; manuel onay bekleniyor (PoolFeed: ${feed._id}).`
        );
        return feed;
      }

      let injectTxHash;
      try {
        injectTxHash = await injectXlmToPool2(xlmAmount);
      } catch (injectError) {
        feed.status = 'failed';
        feed.errorMessage = `Burn başarılı ancak XLM enjeksiyonu başarısız: ${injectError.message}`;
        await feed.save();
        throw injectError;
      }

      feed.injectXlmAmount = String(xlmAmount);
      feed.injectTxHash = injectTxHash;
      feed.exchangeRateNote = `SİMÜLE KUR (DEMO_MODE): ${config.poolFeeder.demoDtlPerXlm} dTL / 1 XLM`;
      feed.status = 'completed';
      feed.completedAt = new Date();
      await feed.save();

      logger.info(`[PoolFeeder] Besleme döngüsü tamamlandı (PoolFeed: ${feed._id}).`);
      return feed;
    } finally {
      feedCycleRunning = false;
    }
  } catch (error) {
    logger.error(`[PoolFeeder] runPoolFeedCycle hatası: ${error.message}`);
    throw error;
  }
}

/**
 * Havuz 4->2 besleme cron job'ını başlatır.
 *
 * @returns {object | null} node-cron ScheduledTask nesnesi veya null.
 */
export function startPoolFeederCron() {
  try {
    if (!stellarConfig.horizonServer) {
      logger.warn('[PoolFeeder] Horizon sunucusu yapılandırılmadığı için cron başlatılamadı.');
      return null;
    }
    if (!config.pools.pool2Address || !config.pools.pool4Address) {
      logger.warn('[PoolFeeder] Havuz adresleri eksik olduğu için cron başlatılamadı.');
      return null;
    }
    if (!config.secrets.issuerSecretKey) {
      logger.warn('[PoolFeeder] İhraççı anahtarı eksik olduğu için cron başlatılamadı.');
      return null;
    }
    if (!cron.validate(config.poolFeeder.cronExpression)) {
      logger.warn(`[PoolFeeder] Geçersiz cron ifadesi: ${config.poolFeeder.cronExpression}`);
      return null;
    }

    logger.info(
      `[PoolFeeder] Havuz 4->2 besleme cron job'ı başlatılıyor ` +
        `(${config.poolFeeder.cronExpression}, eşik: ${config.pool2XlmThreshold} XLM, ` +
        `DEMO_MODE: ${config.demoMode})...`
    );

    const task = cron.schedule(config.poolFeeder.cronExpression, () => {
      runPoolFeedCycle().catch((err) => {
        logger.error(`[PoolFeeder] Asenkron besleme döngüsü hatası: ${err.message}`);
      });
    });

    logger.info("[PoolFeeder] Besleme cron job'ı başarıyla aktif edildi.");
    return task;
  } catch (error) {
    logger.error(`[PoolFeeder] startPoolFeederCron hatası: ${error.message}`);
    throw error;
  }
}
