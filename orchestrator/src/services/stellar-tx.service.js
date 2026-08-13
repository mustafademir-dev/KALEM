/**
 * Stellar İşlem Servisi
 *
 * Stellar SDK üzerinden işlem oluşturma, Soroban kontrat çağrısı (invoke),
 * prepareTransaction (simülasyon ve kaynak montajı) ve Horizon/RPC ağa iletim.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import stellarConfig from '../config/stellar.js';
import logger from '../utils/logger.js';

/**
 * Belirtilen adrese ait hesap bilgilerini Horizon API üzerinden yükler.
 *
 * @param {string} address - Stellar adresi (G... veya C...).
 * @returns {Promise<StellarSdk.Account>} Yüklenen hesap nesnesi.
 */
export async function loadAccount(address) {
  try {
    if (!stellarConfig.horizonServer) {
      throw new Error('Horizon sunucusu yapılandırılmamış.');
    }
    logger.info(`[StellarTx] Hesap bilgisi yükleniyor: ${address}`);
    const account = await stellarConfig.horizonServer.loadAccount(address);
    return account;
  } catch (error) {
    logger.error(`[StellarTx] loadAccount hatası (${address}): ${error.message}`);
    throw error;
  }
}

/**
 * Soroban kontrat fonksiyon çağrısı için simüle edilip montajlanmış (prepareTransaction)
 * imzalanmamış işlem XDR'ı oluşturur.
 *
 * KRİTİK: prepareTransaction (simulate + assemble) adımı çalıştırılmadan
 * oluşturulan işlemler 'insufficient resources' (yetersiz kaynak) hatası alır.
 *
 * @param {object} params
 * @param {string} params.sourceAddress - İşlemi başlatan adres (G...).
 * @param {string} params.contractId - Hedef Soroban kontrat adresi (C...).
 * @param {string} params.method - Çağrılacak kontrat fonksiyonu.
 * @param {Array<StellarSdk.xdr.ScVal>} [params.args=[]] - Kontrat fonksiyon argümanları.
 * @param {string} [params.fee='100'] - Taban ağ ücreti (stroops).
 * @returns {Promise<string>} Hazırlanmış (prepare edilmiş) işlemin XDR dizisi.
 */
export async function buildContractCall({ sourceAddress, contractId, method, args = [], fee = '100' }) {
  try {
    if (!stellarConfig.sorobanServer) {
      throw new Error('Soroban RPC sunucusu yapılandırılmamış.');
    }

    logger.info(`[StellarTx] Kontrat çağrısı oluşturuluyor: ${contractId}.${method}()`);

    // 1. Hesap bilgilerini çek
    const account = await loadAccount(sourceAddress);

    // 2. Kontrat nesnesini oluştur ve fonksiyon operasyonunu hazırla
    const contract = new StellarSdk.Contract(contractId);
    const operation = contract.call(method, ...args);

    // 3. Ham ham (un-assembled) transaction zarfını inşa et
    const rawTx = new StellarSdk.TransactionBuilder(account, {
      fee,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    // 4. Soroban RPCüzerinden prepareTransaction (simulate + assemble) adımını çalıştır
    logger.info(`[StellarTx] prepareTransaction (simulate + assemble) çalıştırılıyor...`);
    const preparedTx = await stellarConfig.sorobanServer.prepareTransaction(rawTx);

    logger.info(`[StellarTx] Kontrat çağrısı başarıyla hazırlandı (prepare edildi).`);
    return preparedTx.toXDR();
  } catch (error) {
    logger.error(`[StellarTx] buildContractCall hatası (${contractId}.${method}): ${error.message}`);
    throw error;
  }
}

/**
 * Bir adresin bir Soroban token kontratındaki bakiyesini salt-okunur
 * simülasyonla (ağa işlem göndermeden, maliyetsiz) sorgular.
 *
 * `balance()` bir view fonksiyonudur; tam invoke gereksiz ağ ücreti ve
 * ledger yazımı üretir. Bu nedenle yalnızca simulateTransaction kullanılır
 * — sorgulanan adresin kendisi, sequence numarası '0' ile yerel olarak
 * kurulan simülasyon kaynağı olarak kullanılır (imza gerekmez).
 *
 * @param {string} contractId - Sorgulanacak token kontratı (C...).
 * @param {string} address - Bakiyesi sorgulanacak adres (G... veya C...).
 * @returns {Promise<string>} Bakiye (stroops, string).
 */
export async function readContractBalance(contractId, address) {
  try {
    if (!stellarConfig.sorobanServer) {
      throw new Error('Soroban RPC sunucusu yapılandırılmamış.');
    }

    const simulationAccount = new StellarSdk.Account(address, '0');
    const contract = new StellarSdk.Contract(contractId);
    const readTx = new StellarSdk.TransactionBuilder(simulationAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: stellarConfig.networkPassphrase,
    })
      .addOperation(contract.call('balance', StellarSdk.Address.fromString(address).toScVal()))
      .setTimeout(30)
      .build();

    const simulation = await stellarConfig.sorobanServer.simulateTransaction(readTx);

    if (!StellarSdk.rpc.Api.isSimulationSuccess(simulation)) {
      throw new Error(`Bakiye simülasyonu başarısız: ${JSON.stringify(simulation.error ?? simulation)}`);
    }

    const rawBalance = StellarSdk.scValToNative(simulation.result.retval); // BigInt (i128)
    return rawBalance.toString();
  } catch (error) {
    logger.error(`[StellarTx] readContractBalance hatası (${contractId}, ${address}): ${error.message}`);
    throw error;
  }
}

/**
 * İmzalı bir işlemi (veya Fee-Bump zarfını) Horizon sunucusuna veya RPC ağa gönderir.
 *
 * @param {StellarSdk.Transaction | StellarSdk.FeeBumpTransaction | string} transaction - İmzalanmış işlem nesnesi veya XDR string'i.
 * @returns {Promise<object>} Horizon/RPC yanıt nesnesi.
 */
export async function submitTransaction(transaction) {
  try {
    let txObj = transaction;
    if (typeof transaction === 'string') {
      txObj = StellarSdk.TransactionBuilder.fromXDR(transaction, stellarConfig.networkPassphrase);
    }

    if (stellarConfig.horizonServer) {
      logger.info(`[StellarTx] İşlem Horizon ağına gönderiliyor...`);
      const response = await stellarConfig.horizonServer.submitTransaction(txObj);
      logger.info(`[StellarTx] İşlem başarıyla gönderildi (Hash: ${response.hash})`);
      return response;
    } else if (stellarConfig.sorobanServer) {
      logger.info(`[StellarTx] İşlem Soroban RPC ağına gönderiliyor...`);
      const response = await stellarConfig.sorobanServer.sendTransaction(txObj);
      return response;
    } else {
      throw new Error('Hiçbir Stellar sunucusu (Horizon veya RPC) yapılandırılmamış.');
    }
  } catch (error) {
    logger.error(`[StellarTx] submitTransaction hatası: ${error.message}`);
    throw error;
  }
}
