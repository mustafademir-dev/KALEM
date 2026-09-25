const SUGGESTION_LIMIT = 6;

/**
 * Yazılan metinle eşleşen fişler. Belge numaraları "KALEM2026…" biçiminde olduğu için
 * esnafın hatırladığı rakamlar numaranın herhangi bir yerinde olabilir: önek değil,
 * "içeriyor" eşleşmesi. Boş metinde en son fişler. İade edilmişler en sona.
 */
export function matchReceipts(items, query) {
  const q = query.trim().toUpperCase();
  const withNo = items.filter((it) => it.gibDocumentNo);
  const hits = q ? withNo.filter((it) => it.gibDocumentNo.toUpperCase().includes(q)) : withNo;
  return [...hits].sort((a, b) => Number(a.refunded) - Number(b.refunded)).slice(0, SUGGESTION_LIMIT);
}
