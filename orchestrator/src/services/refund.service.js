/**
 * İade Servisi — esnafın başlattığı TAM iade (prototip).
 *
 * Esnaf fiş numarasını (GİB belgesindeki `Invoice.ID`) girer; ödeme, kesintiler
 * dahil tamamen geri alınır:
 *
 *   1. esnaftan   pool1Amount (%99,6) yakılır   (burn)
 *   2. Havuz 3'ten pool3Amount (%0,1) yakılır   (burn)
 *   3. Havuz 4'ten pool4Amount (%0,3) yakılır   (burn)
 *   4. müşteriye  totalAmount  (%100) basılır   (mint)
 *
 * Toplam arz değişmez (yakılan = basılan). Havuzlardan aynı ödemenin payı geri
 * alındığı için Havuz 3 / Havuz 4 bakiyeleri ödemeden önceki hâline döner.
 *
 * NEDEN İHRAÇÇI YETKİSİYLE: kontratlarda iade fonksiyonu yok ve `transfer()`
 * esnafın göndermesini koşulsuz reddeder (`MerchantCannotSend`). Kontratı
 * yeniden deploy etmek, contract ID'lerini ve zincirdeki 1:3 kanıtını
 * götürürdü. `burn`/`mint` zaten ihraççının (`require_admin`) yetkisinde; bir
 * e-para kuruluşu da iadeyi kendi defterinde bir düzeltme işlemi olarak yapar.
 * Ürün aşamasında iade kuralları doğrudan kontrata girmelidir.
 *
 * ATOMİK DEĞİL: Soroban işlemi tek bir kontrat çağrısı taşır, yani dört adım dört
 * ayrı işlemdir. Bu yüzden (a) bakiyeler baştan kontrol edilir, (b) müşteriye
 * basma EN SONDA yapılır — yarıda kalan iade müşteriye fazladan para vermez,
 * (c) tamamlanan adımlar kaydedilir ve yeniden deneme kaldığı yerden sürer.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import config from '../config/index.js';
import stellarConfig from '../config/stellar.js';
import Transaction from '../models/Transaction.model.js';
import GibDocument from '../models/GibDocument.model.js';
import logger from '../utils/logger.js';
import { buildContractCall, readContractBalance, submitTransaction } from './stellar-tx.service.js';

export class RefundError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** İhraççı anahtarıyla dtl-token üzerinde `burn(from, amount)` / `mint(to, amount)` çağırır. */
export async function issuerTokenCall(method, address, amountStroops) {
  if (!config.secrets.issuerSecretKey) {
    throw new Error('İhraççı gizli anahtarı yapılandırılmamış (ISSUER_SECRET_KEY).');
  }
  const issuerKeypair = StellarSdk.Keypair.fromSecret(config.secrets.issuerSecretKey);
  const preparedXdr = await buildContractCall({
    sourceAddress: issuerKeypair.publicKey(),
    contractId: config.contracts.dtlTokenId,
    method,
    args: [
      StellarSdk.Address.fromString(address).toScVal(),
      StellarSdk.nativeToScVal(BigInt(amountStroops), { type: 'i128' }),
    ],
  });
  const tx = StellarSdk.TransactionBuilder.fromXDR(preparedXdr, stellarConfig.networkPassphrase);
  tx.sign(issuerKeypair);
  const response = await submitTransaction(tx);
  return response.hash;
}

const defaultDeps = {
  readBalance: (address) => readContractBalance(config.contracts.dtlTokenId, address),
  issuerCall: issuerTokenCall,
};

/** Fiş numarasından, bu esnafa ait iade edilebilir işlemi bulur. */
export async function findRefundTarget(merchant, documentNo) {
  const doc = await GibDocument.findOne({ 'ublContent.Invoice.ID': documentNo }).select('transactionId').lean();
  const tx = doc ? await Transaction.findById(doc.transactionId) : null;
  // Başka esnafın fişi de "bulunamadı" döner — varlığı sızdırılmaz.
  if (!tx || String(tx.merchantId) !== String(merchant._id)) {
    throw new RefundError('NOT_FOUND', 'Bu numarada size ait bir fiş bulunamadı.', 404);
  }
  if (tx.status !== 'confirmed') {
    throw new RefundError('NOT_CONFIRMED', 'Bu ödeme zincirde henüz onaylanmamış, iade edilemez.', 409);
  }
  if (!tx.pool1Amount || !tx.pool3Amount || !tx.pool4Amount) {
    throw new RefundError('NO_BREAKDOWN', 'Bu ödemenin dağılım kaydı yok, iade edilemez.', 409);
  }
  if (tx.refund?.status === 'completed') {
    throw new RefundError('ALREADY_REFUNDED', 'Bu fiş zaten iade edilmiş.', 409);
  }
  if (tx.refund?.status === 'processing') {
    throw new RefundError('REFUND_IN_PROGRESS', 'Bu fiş için bir iade şu anda işleniyor.', 409);
  }
  return tx;
}

/** İadenin zincir adımları, yürütme sırasıyla. Sıfır tutarlı adım atlanır (kontrat 0'ı reddeder). */
export function planSteps(tx, merchant) {
  return [
    { name: 'burn_merchant', method: 'burn', address: merchant.stellarAddress, amount: tx.pool1Amount },
    { name: 'burn_pool3', method: 'burn', address: config.pools.pool3Address, amount: tx.pool3Amount },
    { name: 'burn_pool4', method: 'burn', address: config.pools.pool4Address, amount: tx.pool4Amount },
    { name: 'mint_customer', method: 'mint', address: tx.senderAddress, amount: tx.totalAmount },
  ].filter((s) => BigInt(s.amount) > 0n);
}

/**
 * Fiş numarasıyla tam iade yapar. Aynı fiş için eşzamanlı ikinci istek kilide
 * takılır; daha önce yarıda kalmış (`failed`) iade kaldığı adımdan sürer.
 *
 * @returns {Promise<{transaction: object}>} İadesi tamamlanmış işlem kaydı.
 */
export async function refundPayment({ merchant, documentNo, deps = defaultDeps }) {
  const target = await findRefundTarget(merchant, documentNo);

  const locked = await Transaction.findOneAndUpdate(
    {
      _id: target._id,
      $or: [{ refund: { $exists: false } }, { refund: null }, { 'refund.status': 'failed' }],
    },
    { $set: { 'refund.status': 'processing', 'refund.requestedAt': new Date() }, $unset: { 'refund.error': '' } },
    { new: true }
  );
  if (!locked) {
    throw new RefundError('REFUND_IN_PROGRESS', 'Bu fiş için bir iade şu anda işleniyor.', 409);
  }

  const done = new Set((locked.refund.steps ?? []).map((s) => s.name));
  const remaining = planSteps(locked, merchant).filter((s) => !done.has(s.name));

  try {
    // Önce bakiyeler: yetmeyen varsa HİÇBİR işlem gönderilmeden durulur.
    for (const step of remaining.filter((s) => s.method === 'burn')) {
      const balance = BigInt(await deps.readBalance(step.address));
      if (balance < BigInt(step.amount)) {
        throw new RefundError(
          'INSUFFICIENT_BALANCE',
          step.name === 'burn_merchant'
            ? 'İşletme bakiyeniz bu iade için yetersiz.'
            : 'Havuz bakiyesi bu iade için yetersiz.',
          409
        );
      }
    }

    for (const step of remaining) {
      const txHash = await deps.issuerCall(step.method, step.address, step.amount);
      await Transaction.updateOne(
        { _id: locked._id },
        { $push: { 'refund.steps': { name: step.name, txHash, at: new Date() } } }
      );
      logger.info(`[Refund] ${step.name} tamam (${step.amount} stroop, hash: ${txHash})`);
    }

    const completed = await Transaction.findOneAndUpdate(
      { _id: locked._id },
      { $set: { 'refund.status': 'completed', 'refund.completedAt': new Date() } },
      { new: true }
    );
    logger.info(`[Refund] İade tamamlandı (belge: ${documentNo}, işlem: ${locked._id})`);
    return { transaction: completed };
  } catch (error) {
    await Transaction.updateOne(
      { _id: locked._id },
      { $set: { 'refund.status': 'failed', 'refund.error': error.message } }
    );
    logger.error(`[Refund] İade başarısız (belge: ${documentNo}): ${error.message}`);
    if (error instanceof RefundError) throw error;
    throw new RefundError(
      'REFUND_FAILED',
      'İade zincirde tamamlanamadı. Tekrar denerseniz kaldığı yerden devam eder.',
      502
    );
  }
}
