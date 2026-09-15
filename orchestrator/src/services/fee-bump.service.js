/**
 * Fee-Bump (Dış Zarf) Servisi
 *
 * Bölüm 5.4: İstemciden gelen imzalı iç zarfı (XDR) alır,
 * Stellar CAP-0015 Fee-Bump Transaction ile dış zarfa sarar,
 * Havuz 2'nin (klasik Stellar hesabı, G... adresi) özel anahtarıyla
 * imzalar ve Horizon API'sine iletir.
 *
 * İç zarfın Ed25519 imzası değiştirilmez — dış zarf yalnızca
 * orijinal işlemi paketler ve ağ ücretini üstlenir.
 *
 * GÜVENLİK NOTU: `auth.middleware.js` henüz implemente edilmediği için
 * (bkz. o dosyanın TODO'su), `assertValidInnerTransaction()` şu an
 * sistemdeki TEK savunma katmanıdır — istemciden gelen ham veriyi
 * karşılayan ilk ve tek nokta budur. `/transactions/submit` rotası
 * auth.middleware olmadan açılırsa, kimliksiz herhangi biri geçerli bir
 * iç zarf imzalayıp Havuz 2'nin XLM'ini bedavaya tüketebilir.
 *
 * Akış:
 * 1. İç zarfı parse et (imzalar OLDUĞU GİBİ korunur)
 * 2. Güvenlik sınırı doğrulamaları (assertValidInnerTransaction)
 * 3. Ön-simülasyon (simulateInnerTransaction) — başarısız çağrı için
 *    Havuz 2 ücreti HİÇ harcanmadan reddet
 * 4. Dış zarf ücretini hesapla (calculateFeeBumpBaseFee) ve kur
 * 5. Toplam ücret üzerinde mutlak tavan kontrolü
 * 6. Dış zarfı YALNIZCA Havuz 2 anahtarıyla imzala
 * 7. Ağa ilet (submitTransaction) ve sonucu döndür
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import stellarConfig from '../config/stellar.js';
import { submitTransaction } from './stellar-tx.service.js';

/**
 * İç zarfın Soroban kaynak ücretini (resource fee) stroops olarak okur.
 *
 * `@stellar/stellar-sdk` (v16) `TransactionBuilder.buildFeeBumpTransaction`
 * bu değeri dış ücrete KENDİSİ ekler; bu yüzden `calculateFeeBumpBaseFee`
 * hesabında bu tutar HARİÇ tutulmalıdır (çifte sayım önlemi).
 *
 * @param {StellarSdk.Transaction} innerTx - Parse edilmiş iç zarf.
 * @returns {bigint} Kaynak ücreti; Soroban olmayan veya prepare edilmemiş işlemlerde 0n.
 */
export function readInnerResourceFee(innerTx) {
  try {
    const envelope = innerTx.toEnvelope();
    if (envelope.switch().name !== 'envelopeTypeTx') {
      return 0n;
    }
    const sorobanData = envelope.v1().tx().ext().value();
    if (!sorobanData || typeof sorobanData.resourceFee !== 'function') {
      return 0n;
    }
    return BigInt(sorobanData.resourceFee().toString());
  } catch (error) {
    logger.error(`[FeeBump] readInnerResourceFee hatası: ${error.message}`);
    throw error;
  }
}

/**
 * Fee-Bump dış zarfı için baseFee (operasyon başı ücret) hesaplar.
 *
 * Kural: baseFee >= max(BASE_FEE, ceil((innerFee - resourceFee) / opSayısı)) * marj.
 * Nihai dış ücret SDK tarafından baseFee * (opSayısı + 1) + resourceFee
 * olarak kurulur; marj >= 1 iken bu her zaman innerTx.fee'den büyüktür,
 * dolayısıyla tx_insufficient_fee riski yapısal olarak ortadan kalkar.
 *
 * @param {StellarSdk.Transaction} innerTx - Parse edilmiş iç zarf.
 * @returns {string} baseFee (stroops, string).
 */
export function calculateFeeBumpBaseFee(innerTx) {
  try {
    const opCount = BigInt(innerTx.operations.length || 1);
    const innerTotalFee = BigInt(innerTx.fee);
    const resourceFee = readInnerResourceFee(innerTx);

    const inclusionTotal = innerTotalFee - resourceFee;
    let inclusionPerOp = inclusionTotal > 0n ? inclusionTotal / opCount : 0n;
    if (inclusionTotal > 0n && inclusionTotal % opCount !== 0n) {
      inclusionPerOp += 1n; // yukarı yuvarla — SDK'nın alt sınır kontrolünü asla ihlal etme
    }

    const networkMinimum = BigInt(StellarSdk.BASE_FEE); // '100'
    const floorFee = inclusionPerOp > networkMinimum ? inclusionPerOp : networkMinimum;
    const baseFee = floorFee * BigInt(config.feeBump.baseFeeMultiplier);

    const maxBaseFee = BigInt(config.feeBump.maxBaseFeeStroops);
    if (baseFee > maxBaseFee) {
      throw new Error(`Hesaplanan baseFee üst sınırı aşıyor (${baseFee} > ${maxBaseFee} stroops).`);
    }

    logger.info(
      `[FeeBump] baseFee hesaplandı: ${baseFee} stroops ` +
        `(op: ${opCount}, iç ücret: ${innerTotalFee}, kaynak ücreti: ${resourceFee})`
    );
    return baseFee.toString();
  } catch (error) {
    logger.error(`[FeeBump] calculateFeeBumpBaseFee hatası: ${error.message}`);
    throw error;
  }
}

/**
 * İç zarfın Ed25519 imzasının gerçekten `innerTx.source` hesabına ait
 * olduğunu yerel olarak (ağa gitmeden) doğrular.
 *
 * Bu fonksiyon iki bağımsız amaçla kullanılır: (1) burada, Havuz 2'nin
 * XLM'ini harcamadan önceki güvenlik sınırı doğrulamasının bir parçası
 * olarak; (2) `auth.middleware.js`'teki `submitAuthMiddleware`'de, müşteri
 * tarafından başlatılan (esnaf Bearer API key'i OLMAYAN) `/transactions/submit`
 * çağrıları için REST auth kanıtı olarak — müşterinin işlemi kendi
 * anahtarıyla imzalamış olması, aynı zamanda "bu isteği yapan taraf gerçekten
 * bu Stellar adresinin sahibidir" kanıtı olarak yeniden kullanılır.
 *
 * @param {StellarSdk.Transaction} innerTx
 * @returns {boolean}
 */
export function verifySignedBySource(innerTx) {
  const source = innerTx.source;
  if (!StellarSdk.StrKey.isValidEd25519PublicKey(source)) {
    return false;
  }
  const txHash = innerTx.hash();
  const sourceKeypair = StellarSdk.Keypair.fromPublicKey(source);
  return (innerTx.signatures || []).some((sig) => sourceKeypair.verify(txHash, sig.signature()));
}

/**
 * İstemciden gelen iç zarfı güvenlik sınırı olarak doğrular.
 *
 * Havuz 2'nin XLM'i bu fonksiyondan sonra harcanır; buradaki her kontrol
 * doğrudan bir "bedava gaz sömürüsü" saldırı yüzeyini kapatır.
 *
 * @param {StellarSdk.Transaction | StellarSdk.FeeBumpTransaction} innerTx
 * @returns {void}
 * @throws {Error} Doğrulama başarısızsa.
 */
export function assertValidInnerTransaction(innerTx) {
  try {
    // 1. İç içe fee-bump reddi (fee-bump of fee-bump ağ tarafından da geçersizdir)
    if (innerTx instanceof StellarSdk.FeeBumpTransaction) {
      throw new Error('İç zarf zaten bir Fee-Bump işlemi; iç içe sarmalama reddedildi.');
    }
    if (!(innerTx instanceof StellarSdk.Transaction)) {
      throw new Error('İç zarf geçerli bir Stellar işlemi değil.');
    }

    // 2. En az bir imza taşımalı (imzasız zarf ağda tx_bad_auth alır, ücret boşa gider)
    if (!innerTx.signatures || innerTx.signatures.length === 0) {
      throw new Error('İç zarf imzasız; en az bir Ed25519 imzası zorunludur.');
    }

    // 3. Operasyon sayısı sınırı — dış ücret baseFee * (opSayısı + 1) ile ölçeklenir
    const opCount = innerTx.operations.length;
    if (opCount < 1 || opCount > config.feeBump.maxInnerOperations) {
      throw new Error(`İç zarf operasyon sayısı geçersiz: ${opCount}`);
    }

    // 4. Yalnızca Soroban kontrat çağrısı (invokeHostFunction) sponsorlanır.
    //    Klasik payment/accountMerge sponsorlamak, Havuz 2'yi genel amaçlı
    //    ücretsiz ağ geçidine dönüştürür.
    for (const op of innerTx.operations) {
      if (op.type !== 'invokeHostFunction') {
        throw new Error(`Desteklenmeyen operasyon tipi: ${op.type}`);
      }
    }

    // 5. Kontrat beyaz listesi — yalnızca KALEM kontratlarına yapılan çağrılar
    const allowedContracts = config.feeBump.allowedContractIds;
    for (const op of innerTx.operations) {
      if (op.func.switch().name !== 'hostFunctionTypeInvokeContract') {
        throw new Error('Desteklenmeyen host fonksiyon tipi (yalnızca kontrat çağrısı sponsorlanır).');
      }
      const contractId = StellarSdk.Address.fromScAddress(
        op.func.invokeContract().contractAddress()
      ).toString();
      if (!allowedContracts.includes(contractId)) {
        throw new Error(`Yetkisiz kontrat çağrısı reddedildi: ${contractId}`);
      }
    }

    // 6. Kaynak hesabın kendi havuz adreslerimiz olmaması
    //    (saldırgan havuzların sequence numarasını tüketemez)
    const source = innerTx.source;
    const protectedAddresses = [
      config.pools.pool1Address,
      config.pools.pool2Address,
      config.pools.pool3Address,
      config.pools.pool4Address,
    ].filter(Boolean);
    if (protectedAddresses.includes(source)) {
      throw new Error('İç zarf kaynağı korumalı bir havuz adresi olamaz.');
    }

    // 7. İmzanın gerçekten kaynak hesaba ait olduğunun YEREL doğrulaması
    //    (ağa gitmeden çöp işlemleri eler)
    if (StellarSdk.StrKey.isValidEd25519PublicKey(source)) {
      if (!verifySignedBySource(innerTx)) {
        throw new Error('İç zarf, kaynak hesap tarafından imzalanmamış.');
      }
    }

    // 8. Zaman sınırı — sonsuz timebound'lu zarf süresiz replay penceresi açar
    const maxTime = Number(innerTx.timeBounds?.maxTime ?? 0);
    if (config.feeBump.requireTimeBounds) {
      if (!maxTime) {
        throw new Error('İç zarf sonlu bir maxTime (timebounds) taşımalıdır.');
      }
      if (maxTime * 1000 < Date.now()) {
        throw new Error('İç zarfın geçerlilik süresi dolmuş.');
      }
    }
  } catch (error) {
    logger.error(`[FeeBump] assertValidInnerTransaction hatası: ${error.message}`);
    throw error;
  }
}

/**
 * İç zarfı ağa göndermeden önce salt-okunur simülasyonla doğrular.
 *
 * Başarısız/geçersiz bir kontrat çağrısı bu adımda elenir; böylece
 * Havuz 2'nin XLM'i başarısız olacağı baştan belli bir işlem için
 * hiç harcanmaz.
 *
 * @param {StellarSdk.Transaction} innerTx - Parse edilmiş iç zarf.
 * @returns {Promise<StellarSdk.rpc.Api.SimulateTransactionResponse>} Simülasyon sonucu.
 * @throws {Error} Soroban RPC yapılandırılmamışsa veya simülasyon başarısızsa.
 */
export async function simulateInnerTransaction(innerTx) {
  try {
    if (!stellarConfig.sorobanServer) {
      throw new Error('Soroban RPC sunucusu yapılandırılmamış; ön-simülasyon yapılamıyor.');
    }
    const simulation = await stellarConfig.sorobanServer.simulateTransaction(innerTx);
    if (!StellarSdk.rpc.Api.isSimulationSuccess(simulation)) {
      throw new Error(
        `İç zarf simülasyonu başarısız, Havuz 2 ücreti harcanmayacak: ${JSON.stringify(simulation.error ?? simulation)}`
      );
    }
    logger.info('[FeeBump] İç zarf ön-simülasyonu başarılı.');
    return simulation;
  } catch (error) {
    logger.error(`[FeeBump] simulateInnerTransaction hatası: ${error.message}`);
    throw error;
  }
}

/**
 * Horizon hata yanıtından result_codes ayrıntılarını çıkarır.
 *
 * stellar-sdk Horizon istemcisi HTTP 400'de yalnızca
 * "Request failed with status code 400" mesajı verir; teşhis için gereken
 * bilgi error.response.data.extras içindedir.
 *
 * @param {object} error - Yakalanan hata nesnesi.
 * @returns {object | null} { transaction, operations, innerTransaction, resultXdr } veya null.
 */
export function extractHorizonResultCodes(error) {
  const extras = error?.response?.data?.extras ?? error?.response?.extras ?? error?.extras ?? null;
  if (!extras) return null;
  return {
    transaction: extras.result_codes?.transaction ?? null,
    operations: extras.result_codes?.operations ?? [],
    innerTransaction: extras.result_codes?.inner_transaction ?? null,
    resultXdr: extras.result_xdr ?? null,
  };
}

/**
 * İmzalı iç zarfı Fee-Bump dış zarfı ile sarar ve ağa iletir.
 *
 * @param {string} signedInnerXdr - İstemcinin Ed25519 ile imzaladığı
 *                                   iç zarf (Base64/XDR formatında).
 * @param {object} [opts]
 * @param {(stage: 'fee_bump'|'sending', data: object) => void} [opts.onProgress] -
 *   Canlı işlem akışı (`/flow`) için gözlem kancası. `fee_bump`: dış zarf Havuz 2
 *   ile imzalandı; `sending`: Horizon'a gönderilmek üzere. Kancadaki bir hata
 *   ödeme yolunu ASLA etkilemez.
 * @returns {Promise<object>} Horizon API'sinden dönen işlem sonucu.
 *
 * @throws {Error} İç zarf geçersizse veya Horizon iletimi başarısızsa.
 */
export async function wrapAndSubmitFeeBump(signedInnerXdr, { onProgress } = {}) {
  const progress = (stage, data) => {
    try {
      onProgress?.(stage, data);
    } catch (hookErr) {
      logger.error(`[FeeBump] onProgress kancası hatası (${stage}): ${hookErr.message}`);
    }
  };

  try {
    if (!signedInnerXdr || typeof signedInnerXdr !== 'string') {
      throw new Error('Geçersiz iç zarf: signedInnerXdr boş veya string değil.');
    }
    if (!config.secrets.pool2SecretKey) {
      throw new Error('Havuz 2 gizli anahtarı yapılandırılmamış (POOL2_SECRET_KEY).');
    }

    // 1. İç zarfı parse et — imzalar OLDUĞU GİBİ korunur
    const innerTx = StellarSdk.TransactionBuilder.fromXDR(signedInnerXdr, stellarConfig.networkPassphrase);

    // 2. Güvenlik sınırı doğrulamaları
    assertValidInnerTransaction(innerTx);

    // 3. Ön-simülasyon — başarısızsa Havuz 2 ücreti hiç harcanmaz
    await simulateInnerTransaction(innerTx);

    // 4. Havuz 2 anahtarı ile yapılandırılan adresin tutarlılığı
    const pool2Keypair = StellarSdk.Keypair.fromSecret(config.secrets.pool2SecretKey);
    if (config.pools.pool2Address && pool2Keypair.publicKey() !== config.pools.pool2Address) {
      throw new Error('POOL2_SECRET_KEY, POOL2_ADDRESS ile eşleşmiyor.');
    }

    // 5. Dış zarf ücretini hesapla ve Fee-Bump zarfını kur
    const baseFee = calculateFeeBumpBaseFee(innerTx);
    const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      pool2Keypair.publicKey(),
      baseFee,
      innerTx,
      stellarConfig.networkPassphrase
    );

    // 6. MUTLAK ÜCRET TAVANI — resourceFee SDK tarafından koşulsuz eklendiği için
    //    tek gerçek koruma budur.
    const maxTotalFee = BigInt(config.feeBump.maxTotalFeeStroops);
    if (BigInt(feeBumpTx.fee) > maxTotalFee) {
      throw new Error(`Fee-Bump toplam ücreti üst sınırı aşıyor (${feeBumpTx.fee} > ${maxTotalFee} stroops).`);
    }

    // 7. YALNIZCA dış zarfı Havuz 2 ile imzala (iç imzalar değişmez)
    feeBumpTx.sign(pool2Keypair);

    logger.info(
      `[FeeBump] Dış zarf hazır (feeSource: ${feeBumpTx.feeSource}, ` +
        `toplam ücret: ${feeBumpTx.fee} stroops, iç kaynak: ${innerTx.source})`
    );

    progress('fee_bump', {
      feeSource: feeBumpTx.feeSource,
      maxFee: feeBumpTx.fee,
      baseFee,
      innerTxHash: innerTx.hash().toString('hex'),
      feeBumpHash: feeBumpTx.hash().toString('hex'),
      preSimulation: 'SUCCESS',
    });

    // 8. Ağa ilet
    progress('sending', { sentAt: new Date() });
    const response = await submitTransaction(feeBumpTx);

    logger.info(`[FeeBump] İşlem ağa iletildi (feeBumpHash: ${response.hash}, ledger: ${response.ledger})`);
    return response;
  } catch (error) {
    // Horizon result_codes ayrıntısı — yan etki, ana hatayı asla bastırmaz
    try {
      const codes = extractHorizonResultCodes(error);
      if (codes) {
        logger.error(
          `[FeeBump] Horizon result_codes -> transaction: ${codes.transaction}, ` +
            `inner: ${codes.innerTransaction}, operations: ${JSON.stringify(codes.operations)}`
        );
      }
    } catch (parseErr) {
      logger.error(`[FeeBump] Hata ayrıştırma hatası: ${parseErr.message}`);
    }

    logger.error(`[FeeBump] wrapAndSubmitFeeBump hatası: ${error.message}`);
    throw error;
  }
}
