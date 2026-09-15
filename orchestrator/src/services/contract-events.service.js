/**
 * Kontrat Olayı Okuyucu — `pay_merchant` Atomik Dağılımının Zincirden Okunması
 *
 * `/flow` panelinin 5. (kontrat çalıştı) ve 6. (atomik dağılım) adımlarının
 * veri kaynağıdır. Tutarlar backend'de HESAPLANMAZ; işlemin zincirde yaydığı
 * Soroban olaylarından okunur.
 *
 * ## Neden Horizon değil, Soroban RPC (15 Eylül 2026 denemesiyle doğrulandı)
 *
 * Gerçek ödeme işlemi `b5466573…` üzerinde salt-okunur deneme yapıldı:
 * - Horizon işlem kaydında `result_meta_xdr` alanı ARTIK YOK — kontrat olayları
 *   Horizon'dan okunamıyor.
 * - Soroban RPC `getTransaction(dış fee-bump hash)` → `SUCCESS`,
 *   `events.contractEventsXdr` içinde 4 olay: dtl-token'dan 3 `transfer`
 *   (esnaf, Havuz 3, Havuz 4) + pool-manager'dan 1 `pay_merchant`.
 * - `pay_merchant` başlığı **ScString** olarak kodlanıyor (ScSymbol filtresi 0
 *   olay döndü) — `merchant-chain.service.js`'teki `transfer` tuzağının aynısı.
 *   Rust tarafında `("pay_merchant", from, merchant)` ham `&str` literal'idir.
 * - RPC saklama penceresi 120.960 ledger (~7 gün): olaylar gönderimden hemen
 *   sonra okunup `flowEvents`'e yazılmalıdır, sonradan okunamayabilir.
 *
 * ## "Havuz 1" terimi
 *
 * Panel dilinde Havuz 1 = **Esnaf Kasası** — `pay_merchant`'ta %99,6 esnafın
 * KENDİ adresine gider. `config.pools.pool1Address` (v1 `distribute()`'tan kalma
 * adres) bu akışta hiç yer almaz ve burada KULLANILMAZ.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import stellarConfig from '../config/stellar.js';
import config from '../config/index.js';
import Transaction from '../models/Transaction.model.js';
import { recordFlowEvent } from './flow-events.service.js';
import logger from '../utils/logger.js';

/** RPC işlemi henüz indekslemediyse (`NOT_FOUND`) toplam bekleme süresi. */
const RPC_WAIT_TIMEOUT_MS = 10_000;
const RPC_POLL_INTERVAL_MS = 1_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Soroban RPC'den işlemi getirir; `NOT_FOUND` ise kısa süre yeniden dener.
 *
 * @param {string} txHash
 * @param {object} [opts]
 * @returns {Promise<object>} RPC `getTransaction` cevabı (status SUCCESS/FAILED/NOT_FOUND).
 */
export async function fetchRpcTransaction(
  txHash,
  { timeoutMs = RPC_WAIT_TIMEOUT_MS, intervalMs = RPC_POLL_INTERVAL_MS } = {}
) {
  if (!stellarConfig.sorobanServer) {
    throw new Error('Soroban RPC sunucusu yapılandırılmamış.');
  }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await stellarConfig.sorobanServer.getTransaction(txHash);
    if (response.status !== 'NOT_FOUND' || Date.now() >= deadline) return response;
    await sleep(intervalMs);
  }
}

/** ScVal → native; i128 BigInt'leri string'e çevirir (JSON/Mongo uyumu). */
function toPlain(scVal) {
  const value = StellarSdk.scValToNative(scVal);
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'bigint' ? v.toString() : v));
  return value;
}

/**
 * `contractEventsXdr` içindeki olayları sade nesnelere çevirir.
 *
 * @param {Array<Array<StellarSdk.xdr.ContractEvent>>|Array<StellarSdk.xdr.ContractEvent>} contractEventsXdr
 * @returns {Array<{contractId: string|null, topics: Array<{type: string, value: any}>, data: any}>}
 */
export function decodeContractEvents(contractEventsXdr) {
  return (contractEventsXdr ?? []).flat().map((event) => {
    const body = event.body().v0();
    const rawId = event.contractId();
    return {
      contractId: rawId ? StellarSdk.StrKey.encodeContract(rawId) : null,
      topics: body.topics().map((t) => ({ type: t.switch().name, value: toPlain(t) })),
      data: toPlain(body.data()),
    };
  });
}

/**
 * Çözülmüş olaylardan `pay_merchant` atomik dağılımını çıkarır.
 *
 * Dal adresleri `transfer` olaylarının ALICISINDAN, tutarlar `pay_merchant`
 * olayının verisinden gelir; ikisi çapraz doğrulanır.
 *
 * @param {ReturnType<typeof decodeContractEvents>} events
 * @param {object} contracts
 * @param {string} contracts.poolManagerId
 * @param {string} contracts.dtlTokenId
 * @returns {object|null} Dağılım; `pay_merchant` olayı yoksa null.
 */
export function extractPayMerchantDistribution(events, { poolManagerId, dtlTokenId }) {
  const payEvent = events.find(
    (e) =>
      e.contractId === poolManagerId &&
      e.topics[0]?.type === 'scvString' &&
      e.topics[0]?.value === 'pay_merchant'
  );
  if (!payEvent) return null;

  const [total, merchantShare, pool3Share, pool4Share] = payEvent.data;
  const from = payEvent.topics[1]?.value ?? null;
  const merchantAddress = payEvent.topics[2]?.value ?? null;

  // Kontrat transfer'leri şu sırayla yapar: esnaf, Havuz 3, Havuz 4.
  const transfers = events
    .filter(
      (e) =>
        e.contractId === dtlTokenId &&
        e.topics[0]?.type === 'scvString' &&
        e.topics[0]?.value === 'transfer' &&
        e.topics[1]?.value === from
    )
    .map((e) => ({ to: e.topics[2]?.value ?? null, amount: e.data }));

  const pick = (index, amount) => {
    const t = transfers[index];
    return t && t.amount === amount ? t.to : null;
  };

  const branches = [
    { pool: 1, label: 'Havuz 1 (Esnaf Kasası)', address: merchantAddress, amount: merchantShare },
    { pool: 3, label: 'Havuz 3 (Sosyal Fon)', address: pick(1, pool3Share), amount: pool3Share },
    { pool: 4, label: 'Havuz 4 (Operasyonel)', address: pick(2, pool4Share), amount: pool4Share },
  ];

  const sum = BigInt(merchantShare) + BigInt(pool3Share) + BigInt(pool4Share);
  const merchantTransferMatches = transfers[0]?.to === merchantAddress && transfers[0]?.amount === merchantShare;

  return {
    from,
    total,
    branches,
    transferCount: transfers.length,
    // Üç dalın toplamı pay_merchant'taki toplama eşit mi, transfer olayları dallarla birebir tutuyor mu
    sumMatchesTotal: sum === BigInt(total),
    transfersMatch: merchantTransferMatches && branches.every((b) => b.address),
  };
}

/**
 * Fee-bump dış zarfından ücret sponsoru ve ücret tavanını okur.
 *
 * @param {StellarSdk.xdr.TransactionEnvelope} envelopeXdr
 * @returns {{feeSource: string|null, maxFee: string|null}}
 */
function readFeeBumpEnvelope(envelopeXdr) {
  try {
    if (envelopeXdr?.switch().name !== 'envelopeTypeTxFeeBump') return { feeSource: null, maxFee: null };
    const tx = envelopeXdr.feeBump().tx();
    return {
      feeSource: StellarSdk.StrKey.encodeEd25519PublicKey(tx.feeSource().ed25519()),
      maxFee: tx.fee().toString(),
    };
  } catch {
    return { feeSource: null, maxFee: null };
  }
}

/**
 * İşlemin zincirdeki sonucunu okuyup 5. ve 6. adımların verisini üretir.
 *
 * @param {string} txHash - Fee-Bump dış zarf hash'i.
 * @returns {Promise<{found: boolean, reason?: string, contract?: object, distribution?: object|null}>}
 */
export async function readPaymentOutcome(txHash, opts) {
  const response = await fetchRpcTransaction(txHash, opts);

  if (response.status === 'NOT_FOUND') {
    // Ya henüz indekslenmedi ya da ~7 günlük RPC saklama penceresinin dışında.
    return {
      found: false,
      reason: 'RPC_NOT_FOUND',
      oldestLedger: response.oldestLedger ?? null,
      latestLedger: response.latestLedger ?? null,
    };
  }

  const { feeSource, maxFee } = readFeeBumpEnvelope(response.envelopeXdr);
  const contract = {
    rpcStatus: response.status,
    successful: response.status === 'SUCCESS',
    ledger: response.ledger ?? null,
    ledgerClosedAt: response.createdAt ? new Date(Number(response.createdAt) * 1000).toISOString() : null,
    feeCharged: response.resultXdr ? response.resultXdr.feeCharged().toString() : null,
    feeSource,
    maxFee,
    contractId: config.contracts.poolManagerId || null,
    function: 'pay_merchant',
  };

  if (response.status !== 'SUCCESS') {
    return { found: true, contract, distribution: null };
  }

  const events = decodeContractEvents(response.events?.contractEventsXdr);
  const distribution = extractPayMerchantDistribution(events, {
    poolManagerId: config.contracts.poolManagerId,
    dtlTokenId: config.contracts.dtlTokenId,
  });
  contract.eventCount = events.length;

  if (!distribution) {
    logger.warn(`[ContractEvents] ${txHash}: pay_merchant olayı bulunamadı (${events.length} olay).`);
  }
  return { found: true, contract, distribution };
}

/**
 * Horizon gönderimi başarılı olduktan sonra çağrılır: zincir sonucunu okur,
 * akışın 5. ve 6. adımlarını yazar ve dağılım tutarlarını işlem kaydına işler.
 *
 * Hata FIRLATMAZ ve beklenmesi gerekmez — ödeme cevabı bu okumayı beklemez.
 *
 * @param {string|import('mongoose').Types.ObjectId} transactionId
 * @param {string} txHash - Fee-Bump dış zarf hash'i.
 * @param {object} [opts] - `fetchRpcTransaction` seçenekleri (testler için).
 * @returns {Promise<void>}
 */
export async function recordChainOutcome(transactionId, txHash, opts) {
  try {
    const outcome = await readPaymentOutcome(txHash, opts);

    if (!outcome.found) {
      recordFlowEvent(transactionId, 'contract', {
        status: 'failed',
        data: {
          txHash,
          reason: outcome.reason,
          message: 'İşlem Soroban RPC\'de bulunamadı (henüz indekslenmedi ya da ~7 günlük saklama penceresi dışında).',
          oldestLedger: outcome.oldestLedger,
          latestLedger: outcome.latestLedger,
        },
      });
      return;
    }

    const { contract, distribution } = outcome;
    recordFlowEvent(transactionId, 'contract', {
      status: contract.successful ? 'done' : 'failed',
      data: { txHash, ...contract },
    });
    if (!contract.successful) return;

    if (!distribution) {
      await recordFlowEvent(transactionId, 'distribution', {
        status: 'failed',
        data: { txHash, reason: 'PAY_MERCHANT_EVENT_NOT_FOUND', eventCount: contract.eventCount ?? 0 },
      });
      return;
    }

    // Tutarlar olaydan ÖNCE yazılır: panel dağılımı gördüğünde kayıt da tutarlı olsun.
    const [pool1, pool3, pool4] = distribution.branches;
    await Transaction.updateOne(
      { _id: transactionId },
      { $set: { pool1Amount: pool1.amount, pool3Amount: pool3.amount, pool4Amount: pool4.amount } },
      { timestamps: false }
    );

    const ok = distribution.sumMatchesTotal && distribution.transfersMatch;
    await recordFlowEvent(transactionId, 'distribution', {
      status: ok ? 'done' : 'failed',
      data: {
        txHash,
        ledger: contract.ledger,
        ledgerClosedAt: contract.ledgerClosedAt,
        source: 'soroban_rpc_contract_events',
        ...distribution,
      },
    });
  } catch (error) {
    logger.error(`[ContractEvents] recordChainOutcome hatası (${txHash}): ${error.message}`);
    recordFlowEvent(transactionId, 'contract', {
      status: 'failed',
      data: { txHash, reason: 'RPC_ERROR', message: error.message },
    });
  }
}
