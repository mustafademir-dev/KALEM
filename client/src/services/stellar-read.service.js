/**
 * Zincir Okuma Servisi (Client-Side, Doğrudan)
 *
 * Bazı okumalar orchestrator'a hiç gitmeden doğrudan Soroban RPC/Horizon'a
 * yapılır — çünkü ilgili orchestrator uçları esnaf-Bearer-auth'ludur ve
 * müşteri cüzdanı için uygun değildir (bkz. proje notu / mimari karar):
 *
 * - `GET /merchants/:id/balance` → yalnızca kayıtlı esnaf kendi bakiyesini
 *   sorgulayabiliyor; müşterinin KENDİ bakiyesi için karşılığı yok.
 * - `GET /transactions/:txHash` → yalnızca işlemi gönderen esnaf sorgulayabiliyor.
 *
 * Bu okumalar imza/yetki GEREKTİRMEZ (Soroban simülasyonu ve Horizon tx
 * sorgusu herkese açıktır) — orchestrator'daki `readContractBalance` ve
 * `isMerchantOnChain` (stellar-tx.service.js) ile BİREBİR AYNI desen,
 * yalnızca client'ta çalıştırılır.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  HORIZON_URL,
  SOROBAN_RPC_URL,
  STELLAR_NETWORK_PASSPHRASE,
  DTL_TOKEN_CONTRACT_ID,
  FRIENDBOT_URL,
} from '../utils/constants.js';

const sorobanServer = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);
const horizonServer = new StellarSdk.Horizon.Server(HORIZON_URL);

/**
 * Verilen adresin dtl-token bakiyesini okur (stroop, string).
 * Hesap zincirde hiç var olmasa/bakiyesi hiç oluşmamış olsa bile 0 döner.
 *
 * @param {string} address - G... adresi.
 * @returns {Promise<string>}
 */
export async function readDtlBalance(address) {
  const simulationAccount = new StellarSdk.Account(address, '0');
  const contract = new StellarSdk.Contract(DTL_TOKEN_CONTRACT_ID);
  const readTx = new StellarSdk.TransactionBuilder(simulationAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('balance', StellarSdk.Address.fromString(address).toScVal()))
    .setTimeout(30)
    .build();

  const simulation = await sorobanServer.simulateTransaction(readTx);

  if (!StellarSdk.rpc.Api.isSimulationSuccess(simulation)) {
    // Kayıtlı olmayan/hiç bakiyesi oluşmamış bir hesap için simülasyon
    // "MissingValue"ya benzer bir hatayla başarısız olabilir — bu durum
    // pratikte "bakiye 0" ile aynı anlama gelir.
    return '0';
  }

  const rawBalance = StellarSdk.scValToNative(simulation.result.retval);
  return rawBalance.toString();
}

/**
 * `POST /transactions/submit`'in yanıtı gerçek Stellar tx hash'ini İÇERMEZ
 * (yalnızca `transactionId`/`status` döner) — çünkü Fee-Bump, iç zarfı biz
 * imzalarken bildiğimiz hash'ten (`innerTxHash`) FARKLI bir dış zarf
 * hash'i üretir (CAP-0015). Bu yüzden onayı, orchestrator'a hiç gitmeden,
 * Horizon'un "hesaba göre işlemler" uç noktasını iç zarfın KAYNAK
 * hesabına (müşteri) göre sorgulayıp `inner_transaction.hash` alanıyla
 * eşleştirerek buluyoruz — Horizon, fee-bump'lı işlemleri iç zarfın
 * kaynak hesabı altında da indeksler (bkz. Horizon "Transactions for
 * Account" dokümantasyonu).
 *
 * @param {string} senderAddress - Müşterinin Stellar adresi.
 * @param {string} innerTxHash - `transaction.service.js`'in ürettiği iç zarf hash'i (hex).
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=45000]
 * @param {number} [opts.intervalMs=2500]
 * @returns {Promise<{status: 'success'|'failed'|'timeout', txHash?: string, ledger?: number}>}
 */
export async function awaitInnerTransactionConfirmation(
  senderAddress,
  innerTxHash,
  { timeoutMs = 45000, intervalMs = 2500 } = {}
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const page = await horizonServer
        .transactions()
        .forAccount(senderAddress)
        .order('desc')
        .limit(10)
        .call();

      const match = page.records.find((record) => record.inner_transaction?.hash === innerTxHash);

      if (match) {
        return {
          status: match.successful ? 'success' : 'failed',
          txHash: match.hash,
          ledger: match.ledger_attr ?? match.ledger,
        };
      }
    } catch {
      // Ağ hatası — bir sonraki denemede tekrar denenir, döngü sonunda timeout ile çıkılır.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { status: 'timeout' };
}

/**
 * Verilen hesabın Horizon'da mevcut (fonlanmış) olup olmadığını kontrol eder —
 * QR onay ekranında esnaf adresinin en azından var olduğunu doğrulamak için.
 *
 * @param {string} address
 * @returns {Promise<boolean>}
 */
export async function accountExists(address) {
  try {
    await horizonServer.loadAccount(address);
    return true;
  } catch (error) {
    if (error?.response?.status === 404) return false;
    throw error;
  }
}

/**
 * Testnet Friendbot'u çağırıp verilen adresi fonlar (yeni bir classic
 * Stellar hesabı oluşturur, 10.000 testnet XLM ile). YALNIZCA testnet'te
 * çalışır — mainnet'te Friendbot diye bir şey YOKTUR (bkz.
 * docs/ARCHITECTURE_DECISIONS.md §6.7). "Bakiye Yükle" akışının 1. adımı.
 *
 * @param {string} address - G... adresi.
 * @returns {Promise<{hash: string}>}
 */
export async function fundViaFriendbot(address) {
  let response;
  try {
    response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`);
  } catch {
    throw new Error('Friendbot sunucusuna ulaşılamadı — internet bağlantınızı kontrol edin.');
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.detail || 'Friendbot hesabı fonlayamadı.');
  }
  return { hash: body?.hash ?? null };
}
