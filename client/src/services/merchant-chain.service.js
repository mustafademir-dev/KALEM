/**
 * Esnaf — Zincir Üzerinden Gelen Ödeme Sorgulama
 *
 * Backend'de esnafa "gelen ödemeyi canlı gör" imkanı veren bir push/WebSocket
 * altyapısı YOK (`orchestrator/src/services/notification.service.js` ↔
 * `notifyClient()` hâlâ bir TODO — `logger.warn('henüz implemente edilmedi')`).
 * Ayrıca "işlem geçmişi" için de esnafa özel bir liste ucu yok (yalnızca tek
 * bir hash için `GET /transactions/:txHash` var).
 *
 * Bu yüzden her ikisi de AYNI birincil üzerine kuruludur: `dtl-token`
 * kontratının `transfer()` fonksiyonunun yaydığı Soroban event'i —
 * `env.events().publish(("transfer", from, to), amount)`
 * (bkz. contracts/dtl-token/src/token.rs, salt satır ~344-346). Soroban RPC
 * `getEvents` ile bu event'i doğrudan, backend'e hiç gitmeden sorguluyoruz —
 * hem "canlı ödeme algılama" (kısa aralıklı polling) hem "işlem geçmişi"
 * (geniş pencereli tek sorgu) AYNI fonksiyonu kullanır.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { SOROBAN_RPC_URL, DTL_TOKEN_CONTRACT_ID } from '../utils/constants.js';

const sorobanServer = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);

/**
 * DİKKAT: `token.rs`'teki `env.events().publish(("transfer", from, to), amount)`
 * çağrısı `"transfer"` için ham bir Rust `&str` literal'i kullanıyor —
 * `symbol_short!`/`Symbol::new` ile ÜRETİLMEMİŞ. Soroban SDK bu durumda
 * topic'i bir `ScSymbol` (XDR tip 15) DEĞİL, `ScString` (XDR tip 14) olarak
 * kodluyor. Gerçek testnet event'i çekilip byte byte karşılaştırılarak
 * doğrulandı — `type: 'symbol'` kullanmak (ScSymbol üretir) topic filtresinin
 * SESSİZCE hiçbir zaman eşleşmemesine yol açıyordu (hata fırlatmıyor,
 * yalnızca boş sonuç dönüyordu).
 */
const TRANSFER_TOPIC0 = StellarSdk.xdr.ScVal.scvString('transfer').toXDR('base64');

function addressTopic(address) {
  return StellarSdk.Address.fromString(address).toScVal().toXDR('base64');
}

/**
 * `merchantAddress`'e yapılmış `transfer()` çağrılarını (dtl-token event'leri)
 * `startLedger`'dan itibaren getirir — en yeni önce.
 *
 * @param {string} merchantAddress - Esnafın Stellar adresi (G...).
 * @param {object} [opts]
 * @param {number} [opts.startLedger] - Belirtilmezse son ~4 saatlik pencere kullanılır.
 * @param {number} [opts.limit=50]
 * @returns {Promise<Array<{from: string, amount: string, ledger: number, closedAt: string, txHash: string|null}>>}
 */
export async function getIncomingTransfers(merchantAddress, { startLedger, limit = 50 } = {}) {
  let effectiveStartLedger = startLedger;
  if (!effectiveStartLedger) {
    const latest = await sorobanServer.getLatestLedger();
    effectiveStartLedger = Math.max(latest.sequence - 2000, 1); // ~ son birkaç saat
  }

  const response = await sorobanServer.getEvents({
    startLedger: effectiveStartLedger,
    filters: [
      {
        type: 'contract',
        contractIds: [DTL_TOKEN_CONTRACT_ID],
        topics: [[TRANSFER_TOPIC0, '*', addressTopic(merchantAddress)]],
      },
    ],
    limit,
  });

  const events = (response.events ?? []).map((event) => {
    const from = StellarSdk.scValToNative(event.topic[1]);
    const amount = StellarSdk.scValToNative(event.value).toString();
    return {
      from,
      amount,
      ledger: event.ledger,
      closedAt: event.ledgerClosedAt,
      txHash: event.txHash ?? null,
    };
  });

  events.reverse(); // Soroban RPC en eskiden en yeniye döner — en yeni önce istiyoruz.
  return events;
}

/**
 * QR gösterildikten sonra, o ana kadarki son ledger'ı işaretlemek için.
 * @returns {Promise<number>}
 */
export async function getCurrentLedger() {
  const latest = await sorobanServer.getLatestLedger();
  return latest.sequence;
}

/**
 * `sinceLedger`'dan SONRA `merchantAddress`'e gelen, `expectedTotal`'a (QR'da
 * gösterilen TOPLAM tutar) karşılık gelen ilk transferi arar — yoksa `null`
 * döner. QR ekranındaki kısa aralıklı polling için kullanılır.
 *
 * DİKKAT: `dtl-token.transfer()` event'indeki tutar, esnafın GERÇEKTEN aldığı
 * pay'dir — `pool-manager.pay_merchant()` toplam tutarın yalnızca %99.6'sını
 * esnafa yönlendirir (kalan %0.4 Havuz 3/4'e gider, bkz.
 * docs/ARCHITECTURE_DECISIONS.md §7). Yani event tutarı HİÇBİR ZAMAN
 * `expectedTotal`'a EŞİT ya da BÜYÜK olmaz — `>=` karşılaştırması her zaman
 * yanlış (false negative) sonuç verirdi (gerçek testnet ödemesiyle
 * doğrulanan bir bug). Bunun yerine "beklenen toplamın en az %99'u" gibi
 * gevşek bir alt sınır kullanılır — tam orana (%99.6) sıkı bağımlı olmadan,
 * alakasız/çok küçük transferleri elemeye yeter.
 *
 * @param {string} merchantAddress
 * @param {object} params
 * @param {number} params.sinceLedger
 * @param {string} params.expectedTotal - QR'daki toplam tutar (stroop, string).
 */
export async function findNewPayment(merchantAddress, { sinceLedger, expectedTotal }) {
  const transfers = await getIncomingTransfers(merchantAddress, { startLedger: sinceLedger });
  const min = (BigInt(expectedTotal) * 99n) / 100n;
  return transfers.find((t) => t.ledger > sinceLedger && BigInt(t.amount) >= min) ?? null;
}
