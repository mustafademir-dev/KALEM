/**
 * Esnaf Raporlama Servisi
 *
 * Esnaf ana ekranı (bugünkü özet, son işlemler, Sosyal Fon), işlem listesi
 * (Faturalarım) ve gün sonu CSV'si için OKUMA yapar. Ödeme yoluna hiçbir
 * şekilde dokunmaz.
 *
 * ## Veri kaynağı ve sınırları (bilinçli)
 *
 * - Kaynak, MongoDB'deki `Transaction` kayıtlarıdır; yalnızca `confirmed` işlemler sayılır.
 * - Komisyon/net (`pool1/3/4Amount`) zincirdeki `pay_merchant` olaylarından yazılır
 *   (bkz. contract-events.service.js) ve yalnızca 15 Eylül 2026'dan SONRAKİ (ve RPC
 *   okuması başarılı olmuş) işlemlerde DOLUDUR. Eski/eksik kayıtlar için değer
 *   UYDURULMAZ, doldurma yapılmaz: satırda `null` ("veri yok") döner, toplamlara
 *   girmez ve kaç işlemin dışarıda kaldığı `missingBreakdownCount` ile bildirilir.
 * - Brüt = müşterinin ödediği (`totalAmount`); Net = esnafa geçen (`pool1`);
 *   Komisyon = Sosyal Fon (`pool3`, %0,1) + Operasyonel (`pool4`, %0,3).
 *
 * ## Gün sınırı
 *
 * Günler Türkiye saatine göre hesaplanır. Türkiye 2016'dan beri kalıcı UTC+3'tedir
 * (yaz saati uygulaması yok), bu yüzden sabit +3 saat farkı doğrudur.
 */

import Transaction from '../models/Transaction.model.js';
import GibDocument from '../models/GibDocument.model.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { readContractBalance } from './stellar-tx.service.js';
import { isStroops, stroopsToKurus, kurusToFixed2, kurusExcludingVat, stroopsToTl } from '../utils/money.js';

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` (Türkiye saati) → o günün UTC aralığı; geçersizse null. */
export function istanbulDayRange(dateStr) {
  const m = DATE_RE.exec(String(dateStr ?? ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  // 2026-02-31 gibi taşan tarihleri reddet
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const from = new Date(probe.getTime() - ISTANBUL_OFFSET_MS);
  return { date: dateStr, from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

/** Şu anın Türkiye saatine göre tarihi (`YYYY-MM-DD`). */
export function istanbulToday(now = new Date()) {
  return new Date(now.getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC anını Türkiye saatinde `HH:MM:SS` olarak yazar. */
function istanbulTime(date) {
  return new Date(new Date(date).getTime() + ISTANBUL_OFFSET_MS).toISOString().slice(11, 19);
}

function hasBreakdown(tx) {
  return isStroops(tx.pool1Amount) && isStroops(tx.pool3Amount) && isStroops(tx.pool4Amount);
}

/**
 * Bir `Transaction` kaydını API satırına çevirir. Tüm tutarlar STROOP string'idir;
 * TL dönüşümü/biçimi istemcidedir. Dağılım verisi yoksa ilgili alanlar `null` döner.
 */
export function toRow(tx, gibInfo) {
  const breakdown = hasBreakdown(tx);
  return {
    id: tx._id.toString(),
    txHash: tx.txHash ?? null,
    createdAt: new Date(tx.createdAt).toISOString(),
    status: tx.status,
    totalAmount: tx.totalAmount,
    commission: breakdown ? (BigInt(tx.pool3Amount) + BigInt(tx.pool4Amount)).toString() : null,
    socialFund: breakdown ? tx.pool3Amount : null,
    net: breakdown ? tx.pool1Amount : null,
    hasBreakdown: breakdown,
    hasGibDocument: Boolean(tx.gibDocumentId),
    gibDocumentNo: gibInfo?.get(String(tx.gibDocumentId)) ?? null,
    refunded: tx.refund?.status === 'completed',
  };
}

/** Bir işlem listesi için GİB belge numaralarını (`Invoice.ID`) tek sorguyla getirir. */
export async function loadGibNumbers(transactions) {
  const ids = transactions.map((t) => t.gibDocumentId).filter(Boolean);
  const map = new Map();
  if (ids.length === 0) return map;
  const docs = await GibDocument.find({ _id: { $in: ids } }).select('ublContent.Invoice.ID').lean();
  for (const doc of docs) map.set(String(doc._id), doc.ublContent?.Invoice?.ID ?? null);
  return map;
}

/**
 * İşlemleri toplar. Komisyon/net/sosyal fon yalnızca dağılım verisi OLAN işlemlerden
 * hesaplanır; gerisi `missingBreakdownCount`'ta sayılır (uydurma yok).
 */
export function summarize(transactions) {
  let gross = 0n;
  let commission = 0n;
  let net = 0n;
  let socialFund = 0n;
  let breakdownCount = 0;

  for (const tx of transactions) {
    if (isStroops(tx.totalAmount)) gross += BigInt(tx.totalAmount);
    if (hasBreakdown(tx)) {
      breakdownCount += 1;
      socialFund += BigInt(tx.pool3Amount);
      commission += BigInt(tx.pool3Amount) + BigInt(tx.pool4Amount);
      net += BigInt(tx.pool1Amount);
    }
  }

  return {
    count: transactions.length,
    gross: gross.toString(),
    commission: commission.toString(),
    net: net.toString(),
    socialFund: socialFund.toString(),
    breakdownCount,
    missingBreakdownCount: transactions.length - breakdownCount,
  };
}

/** İadesi tamamlanmış işlemler ciro/komisyon/Sosyal Fon toplamlarına girmez (bkz. refund.service.js). */
const NOT_REFUNDED = Object.freeze({ 'refund.status': { $ne: 'completed' } });

/** Esnafın bir günlük (Türkiye saati) onaylı ve iade EDİLMEMİŞ işlemleri, yeniden eskiye. */
export async function findConfirmedInRange(merchantId, from, to, { limit = 2000 } = {}) {
  return Transaction.find({
    merchantId,
    status: 'confirmed',
    ...NOT_REFUNDED,
    createdAt: { $gte: from, $lt: to },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .lean();
}

// --- Sosyal Fon (Havuz 3) bakiyesi: kısa süreli önbellek ---------------------------

const FUND_CACHE_MS = 30_000;
let fundCache = { at: 0, value: null };

/** Test için önbelleği temizler. */
export function resetSocialFundCache() {
  fundCache = { at: 0, value: null };
}

/**
 * Sosyal Fon'un (Havuz 3) güncel toplam bakiyesini zincirden okur (stroop). 30 sn önbellek —
 * her esnaf ana ekranı açılışında RPC'ye gitmemek için. Adres yapılandırılmamışsa ya da
 * okuma başarısızsa `null` döner (ana ekran yine de çalışır).
 */
export async function getSocialFundBalance() {
  const address = config.pools.pool3Address;
  if (!address) return null;

  if (Date.now() - fundCache.at < FUND_CACHE_MS && fundCache.value !== null) return fundCache.value;
  try {
    const balance = await readContractBalance(config.contracts.dtlTokenId, address);
    fundCache = { at: Date.now(), value: balance };
    return balance;
  } catch (error) {
    logger.warn(`[Report] Sosyal Fon bakiyesi okunamadı: ${error.message}`);
    return fundCache.value; // varsa eski (bayat) değer, yoksa null
  }
}

/** Esnafın kendi işlemlerinden Sosyal Fon'a giden tüm zamanların toplamı. */
async function lifetimeSocialContribution(merchantId) {
  const docs = await Transaction.find({
    merchantId,
    status: 'confirmed',
    ...NOT_REFUNDED,
    pool3Amount: { $exists: true, $ne: null },
  })
    .select('pool3Amount')
    .lean();
  let total = 0n;
  let count = 0;
  for (const doc of docs) {
    if (isStroops(doc.pool3Amount)) {
      total += BigInt(doc.pool3Amount);
      count += 1;
    }
  }
  return { total: total.toString(), count };
}

/**
 * Esnaf ana ekranı için TEK çağrıda tüm veri. (Atlas ile uygulama farklı bölgelerde
 * olabildiği için her Mongo/RPC gidiş-dönüşü pahalıdır; ekran tek istekle açılır.)
 * Bakiye ve Sosyal Fon bakiyesi best-effort'tur — okunamazsa `null` döner, istek başarısız olmaz.
 */
export async function buildDashboard(merchant, now = new Date()) {
  const today = istanbulDayRange(istanbulToday(now));

  const [todayTxs, recentTxs, contribution, fundTotal, balance] = await Promise.all([
    findConfirmedInRange(merchant._id, today.from, today.to),
    Transaction.find({ merchantId: merchant._id, status: 'confirmed' })
      .sort({ createdAt: -1, _id: -1 })
      .limit(5)
      .lean(),
    lifetimeSocialContribution(merchant._id),
    getSocialFundBalance(),
    readContractBalance(config.contracts.dtlTokenId, merchant.stellarAddress).catch((err) => {
      logger.warn(`[Report] Esnaf bakiyesi okunamadı: ${err.message}`);
      return null;
    }),
  ]);

  const gibNumbers = await loadGibNumbers(recentTxs);

  return {
    merchant: {
      id: merchant._id.toString(),
      businessName: merchant.businessName,
      stellarAddress: merchant.stellarAddress,
      onChainRegistered: merchant.onChainRegistered,
      kycStatus: merchant.kycStatus,
    },
    balance,
    today: { date: today.date, ...summarize(todayTxs) },
    recent: recentTxs.map((tx) => toRow(tx, gibNumbers)),
    socialFund: {
      yourContribution: contribution.total,
      contributionTxCount: contribution.count,
      total: fundTotal,
    },
    generatedAt: now.toISOString(),
  };
}

// --- İşlem listesi (sayfalı) --------------------------------------------------------

/** Sayfalama imleci: `<createdAt ISO>|<_id>`. Bozuksa null. */
export function parseCursor(raw) {
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([a-f0-9]{24})$/i.exec(String(raw ?? ''));
  if (!m || Number.isNaN(Date.parse(m[1]))) return null;
  return { createdAt: new Date(m[1]), id: m[2] };
}

export async function listTransactions(merchantId, { limit = 20, cursor = null, date = null } = {}) {
  const filter = { merchantId, status: 'confirmed' };
  const range = date ? istanbulDayRange(date) : null;

  if (range) {
    filter.createdAt = { $gte: range.from, $lt: range.to };
  }
  if (cursor) {
    const before = {
      $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }],
    };
    filter.$and = [before];
  }

  const rows = await Transaction.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1) // bir fazlası: sonraki sayfa var mı?
    .lean();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const gibNumbers = await loadGibNumbers(page);
  const last = page[page.length - 1];

  const result = {
    items: page.map((tx) => toRow(tx, gibNumbers)),
    nextCursor: hasMore && last ? `${new Date(last.createdAt).toISOString()}|${last._id.toString()}` : null,
  };
  // Gün filtresi varsa, o günün TAMAMININ özeti (yalnızca bu sayfanın değil) — Gün Sonu ekranı için.
  if (range) {
    result.summary = { date, ...summarize(await findConfirmedInRange(merchantId, range.from, range.to)) };
  }
  return result;
}

// --- Gün sonu CSV ---------------------------------------------------------------------

/** CSV hücresi: `;`, tırnak, satır sonu içeriyorsa tırnaklar; formül enjeksiyonunu (=,+,-,@) etkisizleştirir. */
export function csvText(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Sayısal hücre (formül koruması gerekmez): stroop → "1250,75" (en az 2 ondalık, virgüllü). */
function csvTl(stroops) {
  return stroopsToTl(stroops, { minDecimals: 2, decimalSeparator: ',' });
}
function csvKurus(kurus) {
  return kurusToFixed2(kurus).replace('.', ',');
}
const NA = 'veri yok';

/**
 * Bir günün gün sonu raporunu CSV metni olarak üretir. Excel (TR) uyumlu: UTF-8 BOM,
 * `;` ayraç, virgüllü ondalık, CRLF. "SİMÜLASYON" damgası başta ve sonda ZORUNLUDUR.
 * Tutarlar `Transaction.totalAmount`'tan hesaplanır (GİB belgesindeki metinden değil):
 * bu, 19 Eylül 2026 düzeltmesinden ÖNCE üretilmiş (tutarı 10.000.000× şişkin) belgelerde de doğrudur.
 */
export async function buildDailyReportCsv(merchant, dateStr, now = new Date()) {
  const range = istanbulDayRange(dateStr);
  const LIMIT = 2000;
  const txs = (await findConfirmedInRange(merchant._id, range.from, range.to, { limit: LIMIT + 1 })).reverse();
  const truncated = txs.length > LIMIT;
  if (truncated) txs.shift(); // en eskiyi at (rapor "son 2000" olur)
  const gibNumbers = await loadGibNumbers(txs);
  const summary = summarize(txs);

  let vatTotal = 0n;
  let netExclTotal = 0n;

  const lines = [];
  const row = (...cells) => lines.push(cells.join(';'));

  row(csvText('KALEM Gün Sonu Raporu'));
  row('İşletme', csvText(merchant.businessName));
  row('VKN', csvText(merchant.taxId));
  row('Tarih', `${dateStr} (Türkiye saati)`);
  row('Oluşturulma', now.toISOString());
  row();
  row(
    'Belge No', 'Saat', 'Brüt Tutar (TL)', 'Matrah (TL)', 'KDV %20 (TL)',
    'Sosyal Fon %0,1 (TL)', 'Hizmet Bedeli %0,3 (TL)', 'Toplam Komisyon (TL)', 'Net Kazanç (TL)', 'İşlem No (Stellar)'
  );

  for (const tx of txs) {
    const totalKurus = stroopsToKurus(tx.totalAmount);
    const exclKurus = kurusExcludingVat(totalKurus);
    vatTotal += totalKurus - exclKurus;
    netExclTotal += exclKurus;
    const br = hasBreakdown(tx);
    row(
      csvText(gibNumbers.get(String(tx.gibDocumentId)) ?? NA),
      istanbulTime(tx.createdAt),
      csvTl(tx.totalAmount),
      csvKurus(exclKurus),
      csvKurus(totalKurus - exclKurus),
      br ? csvTl(tx.pool3Amount) : NA,
      br ? csvTl(tx.pool4Amount) : NA,
      br ? csvTl((BigInt(tx.pool3Amount) + BigInt(tx.pool4Amount)).toString()) : NA,
      br ? csvTl(tx.pool1Amount) : NA,
      csvText(tx.txHash ?? NA)
    );
  }

  const hizmet = BigInt(summary.commission) - BigInt(summary.socialFund);
  row(
    'TOPLAM', `${summary.count} işlem`, csvTl(summary.gross), csvKurus(netExclTotal), csvKurus(vatTotal),
    csvTl(summary.socialFund), csvTl(hizmet.toString()), csvTl(summary.commission), csvTl(summary.net), ''
  );
  row();
  if (summary.missingBreakdownCount > 0) {
    row(
      csvText(
        `Not: ${summary.missingBreakdownCount} işlemde komisyon/net verisi yok ("${NA}"); bu işlemler ` +
          'Sosyal Fon, Hizmet Bedeli, Komisyon ve Net toplamlarına DAHİL DEĞİLDİR (Brüt/Matrah/KDV toplamlarına dahildir).'
      )
    );
  }
  if (truncated) row(csvText(`Not: Gün ${LIMIT}'den fazla işlem içeriyor; rapor son ${LIMIT} işlemi kapsar.`));

  return `﻿${lines.join('\r\n')}\r\n`;
}
