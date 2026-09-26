/**
 * Müşteri Fiş Arşivi — saf mantık (I/O YOK, bu yüzden `node --test` ile test edilir).
 *
 * Müşterinin sistemde bir kimliği/oturumu yoktur; yalnızca cihazdaki cüzdanı
 * vardır. Bu yüzden "fişlerim" listesi SUNUCUDAN ÇEKİLMEZ, cihazda tutulur:
 * her başarılı ödemede işlemin hash'i + birkaç görüntüleme alanı kaydedilir,
 * fişin kendisi açılırken `GET /transactions/:txHash/gib-document` ile
 * sunucudan taze alınır (yani fişin İÇERİĞİ hiçbir zaman cihazda kopyalanmaz).
 *
 * Neden sunucudan liste çekmiyoruz: o uç, müşteriyi yalnızca `?senderAddress=`
 * eşleşmesiyle yetkilendiriyor ve Stellar adresleri zincirde herkese açık.
 * Adres bazlı bir LİSTE ucu, zincirden adres gören herkesin o kişinin tüm
 * alışveriş geçmişini dökmesine izin verirdi. Cihazda tutmak bu yüzeyi hiç
 * açmıyor. (Bedeli: cihaz/tarayıcı verisi silinirse liste gider — cüzdan
 * anahtarının kendisi de aynı şekilde gittiği için sistemle tutarlı.)
 *
 * BOYUT SINIRI: native tarafta depo `expo-secure-store` ve Android'de değer
 * başına ~2048 baytlık bir sınır vardır (aşılırsa yazma başarısız olur). Bu
 * yüzden liste hem kayıt sayısıyla hem BAYT bütçesiyle sınırlanır; sığmazsa
 * en eski kayıtlar sessizce düşürülür (yeni fiş kaybolmaz).
 */

import { istanbulToday } from './dates.js';
import { vatLines } from './vat.js';

/** Arşivde tutulacak en fazla kayıt. */
export const MAX_ENTRIES = 40;

/** Serileştirilmiş arşiv için bayt tavanı (Android SecureStore ~2048 bayt). */
export const MAX_BYTES = 1800;

/**
 * Arşiv, cüzdan adresi başına ayrı tutulur — cüzdan değişirse (yeni cihaz,
 * temizlenmiş depo) eski liste yeni cüzdana ait gibi görünmemelidir.
 *
 * @param {string} stellarAddress
 * @returns {string} Depolama anahtarı (SecureStore'un izin verdiği karakterler).
 */
export function archiveKey(stellarAddress) {
  return `kalem_receipts_v1_${String(stellarAddress ?? '').replace(/[^A-Za-z0-9._-]/g, '')}`;
}

function isValidEntry(entry) {
  return (
    entry &&
    typeof entry === 'object' &&
    typeof entry.txHash === 'string' &&
    entry.txHash.length > 0 &&
    typeof entry.paidAt === 'string'
  );
}

/**
 * Depodan okunan ham metni kayıt listesine çevirir. Bozuk/eksik veri ASLA
 * hata fırlatmaz — arşiv bozulduysa boş liste döner (fiş görüntüleme özelliği
 * yüzünden uygulama açılmaz hale gelmemeli).
 *
 * @param {string|null|undefined} raw
 * @returns {Array<{txHash: string, totalAmount?: string, businessName?: string, paidAt: string}>}
 */
export function parseArchive(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidEntry);
}

/**
 * Yeni bir fişi listeye ekler. Aynı `txHash` zaten varsa TEKRARLANMAZ, kaydın
 * yenisi eskisinin yerini alır (idempotent — aynı ödeme iki kez kaydedilse de
 * listede bir kez görünür). Liste her zaman yeniden eskiye sıralıdır.
 *
 * @param {Array} list - Mevcut liste.
 * @param {object} entry - `{ txHash, totalAmount, businessName, paidAt }`.
 * @returns {Array} Yeni liste (girdi listesi değiştirilmez).
 */
export function upsertEntry(list, entry) {
  if (!isValidEntry(entry)) return Array.isArray(list) ? [...list] : [];
  const rest = (Array.isArray(list) ? list : []).filter(
    (item) => isValidEntry(item) && item.txHash !== entry.txHash
  );
  return [entry, ...rest].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
}

function byteLength(text) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Listeyi depoya yazılacak metne çevirir; sayı ve bayt sınırlarını aşarsa
 * EN ESKİ kayıtları düşürerek sığdırır.
 *
 * @param {Array} list
 * @param {{maxEntries?: number, maxBytes?: number}} [limits]
 * @returns {{json: string, kept: Array, dropped: number}}
 */
export function packArchive(list, { maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES } = {}) {
  const source = (Array.isArray(list) ? list : []).filter(isValidEntry);
  let kept = source.slice(0, Math.max(0, maxEntries));
  let json = JSON.stringify(kept);

  // Baştaki (en yeni) kayıt tek başına bütçeyi aşsa bile onu korumak için
  // döngü 1 kayıtta durur — yeni fiş her koşulda kaydedilmiş olur.
  while (kept.length > 1 && byteLength(json) > maxBytes) {
    kept = kept.slice(0, -1);
    json = JSON.stringify(kept);
  }

  return { json, kept, dropped: source.length - kept.length };
}

/**
 * Arşivden özet çıkarır — müşteri ana sayfasındaki kartlar için.
 *
 * DÜRÜSTLÜK NOTU: bu özet, arşivde NE VARSA onu sayar. Arşiv cihazda tutulduğu
 * ve yalnızca zincirde ONAYLANMIŞ ödemeler yazıldığı için, gerçek harcamanın
 * tamamı olduğu iddia edilemez (cihaz verisi silinmişse ya da onayı zaman
 * aşımına uğramış bir ödeme varsa eksik kalır). Ekranda bu şekilde anlatılır.
 *
 * Ay sınırı Türkiye saatine göre belirlenir (gün sonu raporuyla aynı kural).
 *
 * @param {Array} list
 * @param {{now?: Date}} [options]
 * @returns {{monthTotal: string, monthCount: number, totalCount: number, lastPaidAt: string|null}}
 */
export function summarizeArchive(list, { now = new Date() } = {}) {
  const entries = (Array.isArray(list) ? list : []).filter(isValidEntry);
  const monthPrefix = istanbulToday(now).slice(0, 7);

  let monthTotal = 0n;
  let monthCount = 0;
  let lastPaidAt = null;

  for (const item of entries) {
    const when = new Date(item.paidAt);
    if (Number.isNaN(when.getTime())) continue;

    if (lastPaidAt === null || when > new Date(lastPaidAt)) lastPaidAt = item.paidAt;

    if (istanbulToday(when).slice(0, 7) !== monthPrefix) continue;
    if (item.refundedAt) continue; // iade edilen ödeme harcama sayılmaz
    monthCount += 1;
    try {
      monthTotal += BigInt(item.totalAmount ?? 0);
    } catch {
      // tutar okunamıyorsa işlem SAYILIR ama toplama katılmaz
    }
  }

  return { monthTotal: monthTotal.toString(), monthCount, totalCount: entries.length, lastPaidAt };
}

/**
 * Sunucudan gelen iadeleri arşive işler. Yalnızca arşivde OLAN ve henüz iade
 * işareti taşımayan kayıtlar değişir; `newly` bu çağrıda ilk kez görülen
 * iadelerdir (müşteriye "iade alındı" bildirimi bunlar için gösterilir).
 *
 * @param {Array} list - Arşiv listesi.
 * @param {Array<{txHash: string, amount?: string, documentNo?: string, refundedAt?: string}>} refunds
 * @returns {{list: Array, newly: Array}}
 */
export function applyRefunds(list, refunds) {
  const byHash = new Map((Array.isArray(refunds) ? refunds : []).filter((r) => r?.txHash).map((r) => [r.txHash, r]));
  const newly = [];
  const next = (Array.isArray(list) ? list : []).map((item) => {
    const refund = byHash.get(item.txHash);
    if (!refund || item.refundedAt) return item;
    const refundedAt = refund.refundedAt ?? new Date().toISOString();
    newly.push({ ...item, refundedAt, documentNo: refund.documentNo ?? null });
    return { ...item, refundedAt };
  });
  return { list: next, newly };
}

/**
 * Sunucudaki fiş geçmişini cihazdaki arşivle birleştirir (yeni telefonda eski fişler
 * gelsin diye). Arşivde olmayan fiş eklenir; olan fişin iade bilgisi tamamlanır.
 * `senderAddress` yalnızca ŞU ANKİ cüzdandan farklıysa saklanır (önceki cihazın
 * fişini açarken gerekir) — depo bayt bütçesi dar.
 *
 * @param {Array} list - Arşiv.
 * @param {Array<{txHash, totalAmount, businessName, paidAt, senderAddress, refundedAt}>} receipts
 * @param {string} currentAddress - Bu cihazdaki cüzdan.
 * @returns {Array} Yeni liste (yeniden eskiye).
 */
export function mergeServerReceipts(list, receipts, currentAddress) {
  const byHash = new Map((Array.isArray(list) ? list : []).filter(isValidEntry).map((e) => [e.txHash, e]));
  for (const r of Array.isArray(receipts) ? receipts : []) {
    if (!r?.txHash || !r.paidAt) continue;
    const existing = byHash.get(r.txHash);
    const entry = existing
      ? { ...existing }
      : { txHash: r.txHash, totalAmount: r.totalAmount, businessName: r.businessName ?? undefined, paidAt: r.paidAt };
    if (r.refundedAt && !entry.refundedAt) entry.refundedAt = r.refundedAt;
    if (!existing && r.senderAddress && r.senderAddress !== currentAddress) entry.senderAddress = r.senderAddress;
    byHash.set(r.txHash, entry);
  }
  return [...byHash.values()].sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
}

/**
 * İndirilecek fiş dosyasının adı.
 *
 * @param {{txHash: string, paidAt?: string}} entry
 * @returns {string}
 */
export function receiptFilename(entry) {
  const date = String(entry?.paidAt ?? '').slice(0, 10) || 'tarihsiz';
  const short = String(entry?.txHash ?? '').slice(0, 8) || 'fis';
  return `kalem-fis-${date}-${short}.txt`;
}

function money(value) {
  return value === undefined || value === null ? '—' : `${value} TL`;
}

/**
 * Fiş belgesini paylaşılabilir/indirilebilir düz metne çevirir.
 *
 * @param {object} document - `GET /transactions/:txHash/gib-document` yanıtı.
 * @param {{warning?: string}} [options] - Ör. eski (hatalı tutarlı) belge uyarısı.
 * @returns {string}
 */
/**
 * Belgenin görünen türü. 26 Eylül 2026'dan itibaren belgeler GMÖEBYS'ye uygun
 * e-Arşiv Fatura (`e_arsiv`) olarak üretilir; eski belgeler (`okc_fis`) "e-Belge" kalır.
 */
export function documentTitle(document) {
  return document?.documentType === 'e_arsiv' ? 'e-Arşiv Fatura' : 'e-Belge';
}

/** Alıcı adı (e-Arşiv'de "NİHAİ TÜKETİCİ"); eski belgelerde yok → null. */
export function buyerName(invoice) {
  return invoice?.AccountingCustomerParty?.Party?.PartyName?.Name ?? null;
}

export function receiptToText(document, { warning } = {}) {
  const invoice = document?.ublContent?.Invoice;
  const lines = [];

  if (warning) lines.push(`! ${warning}`, '');

  if (!invoice) {
    lines.push('Belge içeriği okunamadı.');
    return lines.join('\n');
  }

  const items = Array.isArray(invoice.InvoiceLine) ? invoice.InvoiceLine : [invoice.InvoiceLine].filter(Boolean);
  const merchantName = invoice.AccountingSupplierParty?.Party?.PartyName?.Name ?? '—';

  const buyer = buyerName(invoice);
  lines.push(
    `KALEM — ${documentTitle(document)}`,
    '',
    `İşyeri   : ${merchantName}`,
    `VKN      : ${document?.merchantTaxId ?? '—'}`,
    ...(buyer ? [`Alıcı    : ${buyer}`] : []),
    `Belge No : ${invoice.ID ?? '—'}`,
    `Tarih    : ${invoice.IssueDate ?? '—'} ${invoice.IssueTime ?? ''}`.trimEnd(),
    '',
    '------------------------------'
  );

  if (items.length === 0) {
    lines.push('(kalem bilgisi yok)');
  } else {
    for (const line of items) {
      const qty = Number(line?.InvoicedQuantity) > 1 ? `${line.InvoicedQuantity}x ` : '';
      const name = line?.Item?.Name ?? 'Kalem';
      const amount = line?.LineExtensionAmount ?? line?.Price?.PriceAmount;
      lines.push(`${qty}${name} — ${money(amount)}`);
    }
  }

  lines.push(
    '------------------------------',
    `Matrah    : ${money(invoice.LegalMonetaryTotal?.TaxExclusiveAmount)}`,
    ...vatLines(invoice).map((v) => `KDV (%${v.percent})${' '.repeat(Math.max(0, 3 - String(v.percent).length))}: ${money(v.amount)}`),
    `TOPLAM    : ${money(invoice.LegalMonetaryTotal?.PayableAmount)}`,
    '',
    `İşlem no  : ${document?.txHash ?? '—'}`
  );

  return lines.join('\n');
}
