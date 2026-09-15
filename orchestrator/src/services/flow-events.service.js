/**
 * Canlı İşlem Akışı (Flow Events) Servisi
 *
 * Bir ödemenin baştan sona yolculuğunu (`FLOW_STEPS`) `Transaction.flowEvents`
 * dizisine yazar ve `/flow` panelini besleyen bellek-içi yayına iletir.
 *
 * ## Temel ilke: sahte adım yok
 *
 * Bu servis HİÇBİR adımı kendiliğinden işaretlemez. Her `recordFlowEvent()`
 * çağrısı, gerçek bir olayın gerçekleştiği kod noktasından yapılır
 * (imza doğrulaması, idempotency kilidi, Horizon cevabı, RPC'den okunan kontrat
 * olayı, SSE/mutabakat, GİB üretimi, esnaf ack'i).
 *
 * ## Ödeme yolunu ASLA bozmaz
 *
 * Zaman çizelgesi bir gözlem aracıdır; bir kaydın yazılamaması ödemeyi
 * durdurmamalıdır. Bu yüzden `recordFlowEvent()` hiçbir zaman hata fırlatmaz,
 * çağıranlar da onu beklemek (await) ZORUNDA değildir.
 *
 * ## Sıra garantisi
 *
 * Çağıranlar sonucu beklemeden art arda olay yazabildiği için, aynı işleme ait
 * yazmalar işlem başına bir söz (promise) zinciriyle sıraya konur: olaylar
 * diziye çağrılma sırasıyla eklenir ve yayına da o sırayla çıkar.
 *
 * ## Tek instance varsayımı
 *
 * Yayın, süreç içi bir `EventEmitter` ile yapılır — Render'daki tek instance'lı
 * dağıtım için yeterlidir. Olaylar ayrıca MongoDB'de kalıcıdır; panel yeniden
 * bağlandığında ya da servis uyuyup uyandığında `getLatestFlow()` ile geri gelir.
 */

import { EventEmitter } from 'node:events';
import mongoose from 'mongoose';
import Transaction, { FLOW_STEPS } from '../models/Transaction.model.js';
import Merchant from '../models/Merchant.model.js';
import logger from '../utils/logger.js';

const emitter = new EventEmitter();
// Her açık panel bir dinleyicidir; varsayılan 10 sınırı projektör + yedek
// cihazlar + geliştirme sekmeleriyle kolayca aşılır.
emitter.setMaxListeners(100);

/** transactionId (string) → o işlemin son yazma sözü. */
const writeChains = new Map();

/**
 * Bir akış olayını kaydeder ve panele yayınlar. Hata FIRLATMAZ.
 *
 * @param {string|import('mongoose').Types.ObjectId} transactionId
 * @param {string} step - `FLOW_STEPS` elemanlarından biri.
 * @param {object} [opts]
 * @param {'done'|'failed'} [opts.status='done']
 * @param {Date} [opts.at=new Date()] - Olayın gözlemlendiği an. Olay daha önce
 *   yakalanıp sonra yazılıyorsa (ör. imza doğrulaması) GERÇEK an verilmelidir.
 * @param {object} [opts.data={}] - Adıma özgü gerçek veri (hash, ledger, tutar…).
 * @returns {Promise<void>} Yazma ve yayın bittiğinde çözülür; asla reddedilmez.
 */
export function recordFlowEvent(transactionId, step, { status = 'done', at = new Date(), data = {} } = {}) {
  if (!transactionId || !FLOW_STEPS.includes(step)) {
    logger.warn(`[Flow] Geçersiz akış olayı yok sayıldı (tx: ${transactionId}, adım: ${step})`);
    return Promise.resolve();
  }

  const id = transactionId.toString();
  const event = { step, status, at, data };

  const previous = writeChains.get(id) ?? Promise.resolve();
  const current = previous.then(() => persistAndPublish(id, event));
  writeChains.set(id, current);
  current.finally(() => {
    // Zincirin sonundaysak haritayı temizle (bellek sızıntısı olmasın).
    if (writeChains.get(id) === current) writeChains.delete(id);
  });
  return current;
}

async function persistAndPublish(id, event) {
  try {
    // Bağlantı yoksa Mongoose işlemi tamponlar ve ~10 sn sonra hata verir;
    // gözlem aracı için beklemeye değmez, ödeme yolunu da oyalamamalıdır.
    if (mongoose.connection.readyState !== 1) {
      logger.warn(`[Flow] MongoDB bağlı değil, akış olayı yazılamadı (tx: ${id}, adım: ${event.step})`);
      return;
    }

    // `timestamps: false` — `updatedAt` işlemin İŞ durumunu (submitted/confirmed)
    // yansıtmaya devam etmeli. Aksi halde her akış olayı mutabakat job'ının
    // "yeterince eski mi" kontrolünü sıfırlar ve onayı geciktirirdi.
    const result = await Transaction.updateOne(
      { _id: id },
      { $push: { flowEvents: event } },
      { timestamps: false }
    );
    if (result.matchedCount === 0) {
      logger.warn(`[Flow] Akış olayı için işlem bulunamadı (tx: ${id}, adım: ${event.step})`);
      return;
    }

    if (emitter.listenerCount('flow') === 0) return;
    const snapshot = await getFlowSnapshot(id);
    if (snapshot) emitter.emit('flow', snapshot);
  } catch (error) {
    logger.error(`[Flow] Akış olayı kaydedilemedi (tx: ${id}, adım: ${event.step}): ${error.message}`);
  }
}

/**
 * Bekleyen tüm akış yazmalarının bitmesini bekler. Testler ve kapanış için.
 *
 * @returns {Promise<void>}
 */
export async function flushFlowEvents() {
  while (writeChains.size > 0) {
    await Promise.all([...writeChains.values()]);
  }
}

/**
 * Akış güncellemelerine abone olur.
 *
 * @param {(snapshot: object) => void} listener
 * @returns {() => void} Aboneliği sonlandıran fonksiyon.
 */
export function subscribeFlow(listener) {
  emitter.on('flow', listener);
  return () => emitter.off('flow', listener);
}

/** Şu anki abone (açık panel) sayısı. */
export function flowSubscriberCount() {
  return emitter.listenerCount('flow');
}

/**
 * Bir işlemin panelde gösterilecek anlık görüntüsünü üretir.
 *
 * @param {object} transaction - Transaction belgesi (lean veya Mongoose).
 * @returns {Promise<object>}
 */
export async function serializeFlow(transaction) {
  let merchant = null;
  if (transaction.merchantId) {
    const doc = await Merchant.findById(transaction.merchantId).select('businessName stellarAddress').lean();
    if (doc) merchant = { businessName: doc.businessName, stellarAddress: doc.stellarAddress };
  }

  return {
    transactionId: transaction._id.toString(),
    txHash: transaction.txHash ?? null,
    innerTxHash: transaction.innerTxHash ?? null,
    status: transaction.status,
    totalAmount: transaction.totalAmount,
    senderAddress: transaction.senderAddress,
    ledgerNumber: transaction.ledgerNumber ?? null,
    createdAt: transaction.createdAt,
    merchant,
    steps: FLOW_STEPS,
    events: (transaction.flowEvents ?? []).map((e) => ({
      step: e.step,
      status: e.status,
      at: e.at,
      data: e.data ?? {},
    })),
  };
}

/**
 * @param {string} transactionId
 * @returns {Promise<object|null>}
 */
export async function getFlowSnapshot(transactionId) {
  const transaction = await Transaction.findById(transactionId).lean();
  return transaction ? serializeFlow(transaction) : null;
}

/**
 * Akış olayı olan en yeni işlemin anlık görüntüsü — panel açılışı/yeniden bağlanma.
 *
 * @returns {Promise<object|null>}
 */
export async function getLatestFlow() {
  const transaction = await Transaction.findOne({ 'flowEvents.0': { $exists: true } })
    .sort({ createdAt: -1 })
    .lean();
  return transaction ? serializeFlow(transaction) : null;
}
