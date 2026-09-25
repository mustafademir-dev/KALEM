/**
 * API Servisi
 *
 * Orkestrasyon katmanı (Node.js) ile HTTP iletişimi.
 */

import { ORCHESTRATOR_BASE_URL } from '../utils/constants.js';

export class ApiError extends Error {
  constructor(message, { code, status } = {}) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(path, { method = 'GET', headers = {}, body } = {}) {
  let response;
  try {
    response = await fetch(`${ORCHESTRATOR_BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Orkestrasyon sunucusuna ulaşılamadı — internet bağlantınızı kontrol edin.', {
      code: 'NETWORK_ERROR',
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(payload?.message ?? 'İstek başarısız oldu.', {
      code: payload?.error ?? 'UNKNOWN_ERROR',
      status: response.status,
    });
  }

  return payload;
}

/**
 * İmzalı XDR paketini orkestrasyon katmanına gönderir.
 *
 * DİKKAT: Kasıtlı olarak `Authorization` başlığı GÖNDERMİYORUZ — esnafın
 * gizli API anahtarına müşteri cüzdanının erişimi/ihtiyacı yok.
 * `POST /transactions/submit`, `Authorization` başlığı yoksa `signedXdr`'ın
 * kendi kaynak hesabı (müşteri) tarafından imzalandığını doğrudan
 * doğrular (bkz. orchestrator `auth.middleware.js` → `submitAuthMiddleware`).
 *
 * @param {object} params
 * @param {string} params.signedXdr - İmzalı iç zarf (Base64/XDR).
 * @param {string} params.idempotencyKey - UUID v4.
 * @param {string} params.merchantId - Üye işyeri ID.
 * @param {string} params.totalAmount - dTL tutarı (stroop, string).
 * @param {Array} [params.cartItems] - Sepet kalemleri.
 * @returns {Promise<{transactionId: string, status: string, message: string}>}
 */
export async function submitTransaction({
  signedXdr,
  idempotencyKey,
  merchantId,
  totalAmount,
  cartItems,
}) {
  return request('/api/v1/transactions/submit', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: { signedXdr, merchantId, totalAmount, cartItems },
  });
}

/**
 * Yeni bir üye işyeri kaydı oluşturur. `signature`, `stellarAddress`'in
 * özel anahtarıyla `buildMerchantOwnershipChallenge(taxId, stellarAddress)`
 * mesajının imzalanmasıyla üretilir (bkz. utils/merchantChallenge.js).
 *
 * DİKKAT: Bu, esnafı YALNIZCA off-chain kaydeder (`ownershipVerified:true`,
 * `kycStatus:'pending'`). On-chain kayıt (`register_merchant()`), ayrı ve
 * admin-onaylı bir CLI script'iyle (`approve-merchant.mjs`) yapılır — bu
 * uygulamanın KAPSAMI DIŞINDADIR, arka planda ayrıca gerçekleşir.
 *
 * @param {object} params
 * @param {string} params.businessName
 * @param {string} params.taxId
 * @param {string} params.stellarAddress
 * @param {string} params.signature - base64.
 * @param {string} [params.email]
 * @param {string} [params.phone]
 * @returns {Promise<{merchantId: string, businessName: string, kycStatus: string, apiKey: string}>}
 */
export async function registerMerchant({ businessName, taxId, stellarAddress, signature, email, phone, password }) {
  return request('/api/v1/merchants/register', {
    method: 'POST',
    body: { businessName, taxId, stellarAddress, signature, email, phone, password },
  });
}

/**
 * Esnaf girişi: VKN + şifre. Yanıttaki `apiKey` bu cihazın oturum anahtarıdır.
 *
 * @returns {Promise<{merchantId: string, apiKey: string, businessName: string, stellarAddress: string, onChainRegistered: boolean, kycStatus: string}>}
 */
export async function loginMerchant({ taxId, password }) {
  return request('/api/v1/merchants/login', { method: 'POST', body: { taxId, password } });
}

/**
 * Müşteri hesabı açma / giriş: TC + 6 haneli PIN + cihazdaki cüzdanın imzası
 * (`KALEM-CUSTOMER-AUTH:{address}:{timestamp}`). Girişte cihaz farklıysa bakiye
 * yeni cüzdana taşınır (`migratedAmount`).
 */
export async function registerCustomer(body) {
  return request('/api/v1/customers/register', { method: 'POST', body });
}

export async function loginCustomer(body) {
  return request('/api/v1/customers/login', { method: 'POST', body });
}

/**
 * Üye işyerinin dTL bakiyesini sorgular (esnaf tarafı — kendi API anahtarıyla).
 *
 * @param {string} merchantId - Üye işyeri ID.
 * @param {string} apiKey - Esnafın API anahtarı.
 * @returns {Promise<{merchantId: string, stellarAddress: string, balance: string, currency: string, kycStatus: string, onChainRegistered: boolean}>}
 */
export async function getMerchantBalance(merchantId, apiKey) {
  return request(`/api/v1/merchants/${merchantId}/balance`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/**
 * Demo musluktan (faucet) sabit miktarda dTL talep eder — YALNIZCA testnet.
 * Sunucu tutarı KENDİSİ belirler (`FAUCET_MINT_AMOUNT_STROOPS`); burada
 * gönderilmez. `signature`, `address`'in özel anahtarıyla
 * `KALEM-FAUCET-MINT:{address}:{timestamp}` mesajının imzalanmasıyla üretilir
 * (bkz. utils/faucetChallenge.js — orchestrator'daki `buildFaucetMintChallenge`
 * ile TAM eşleşmeli).
 *
 * @param {object} params
 * @param {string} params.address
 * @param {number} params.timestamp
 * @param {string} params.signature - base64.
 * @returns {Promise<{address: string, amount: string, txHash: string, currency: string}>}
 */
export async function requestFaucetMint({ address, timestamp, signature }) {
  return request('/api/v1/faucet/mint', {
    method: 'POST',
    body: { address, timestamp, signature },
  });
}

/**
 * Bir işleme ait GİB (e-Belge/ÖKC fiş simülasyonu) belgesini getirir.
 *
 * İki çağrı biçimi var (bkz. orchestrator `gib.routes.js`):
 * - Esnaf: `{ apiKey }` — Bearer ile, yalnızca KENDİ işlemi.
 * - Müşteri: `{ senderAddress }` — imza gerekmez, yalnızca kendi
 *   gönderen adresini bilmesi yeterli (gizli bir finansal işlem değil).
 *
 * @param {string} txHash
 * @param {object} [opts]
 * @param {string} [opts.apiKey] - Esnaf yolu.
 * @param {string} [opts.senderAddress] - Müşteri yolu.
 * @returns {Promise<object>} GİB belgesi (ublContent dahil).
 */
export async function getGibDocument(txHash, { apiKey, senderAddress } = {}) {
  const query = senderAddress ? `?senderAddress=${encodeURIComponent(senderAddress)}` : '';
  return request(`/api/v1/transactions/${encodeURIComponent(txHash)}/gib-document${query}`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
}

/**
 * Esnaf ekranının bir ödemeyi zincirde GÖRDÜĞÜNÜ backend'e bildirir — canlı
 * işlem akışı (`/flow` paneli) 9. adımı. Backend bu anı başka yoldan bilemez:
 * esnaf ekranı ödemeyi Soroban RPC'den kendisi tespit eder
 * (bkz. merchant-chain.service.js).
 *
 * Kısa aralıkla yeniden dener: esnaf, backend ödemenin hash'ini kaydetmeden
 * birkaç ms önce görmüş olabilir (404) ya da bağlantı anlık kopmuş olabilir.
 * Başarısız olursa ödeme akışını ETKİLEMEZ — yalnızca panelde 9. adım
 * beklemede kalır.
 *
 * @param {string} txHash - Zincirdeki (fee-bump dış zarf) hash.
 * @param {object} params
 * @param {string} params.apiKey - Esnafın API anahtarı.
 * @param {number} [params.detectedLedger]
 * @returns {Promise<boolean>} Bildirim kaydedildiyse true.
 */
export async function acknowledgePaymentSeen(txHash, { apiKey, detectedLedger } = {}) {
  const attempts = 4;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await request(`/api/v1/transactions/${encodeURIComponent(txHash)}/merchant-ack`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: { detectedLedger },
      });
      return true;
    } catch (err) {
      const retriable = !(err instanceof ApiError) || err.code === 'NETWORK_ERROR' || err.status === 404 || err.status >= 500;
      if (!retriable || i === attempts - 1) return false;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  return false;
}

/**
 * Esnaf ana ekranı için TEK çağrıda tüm veri: bakiye, bugünkü özet, son işlemler,
 * Sosyal Fon (bkz. orchestrator `merchant-reports.routes.js`). Tüm tutarlar STROOP string'idir.
 *
 * @param {string} merchantId
 * @param {string} apiKey
 * @returns {Promise<object>}
 */
export async function getMerchantDashboard(merchantId, apiKey) {
  return request(`/api/v1/merchants/${merchantId}/dashboard`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/**
 * Esnafın onaylı işlemleri, yeniden eskiye, sayfalı (Faturalarım). `date` (YYYY-MM-DD,
 * Türkiye saati) verilirse yalnızca o gün ve yanıta o günün TAMAMININ özeti (`summary`) eklenir.
 *
 * @param {string} merchantId
 * @param {string} apiKey
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {string} [opts.cursor] - Önceki yanıttaki `nextCursor`.
 * @param {string} [opts.date]
 * @returns {Promise<{items: Array, nextCursor: string|null, summary?: object}>}
 */
export async function getMerchantTransactions(merchantId, apiKey, { limit, cursor, date } = {}) {
  const query = new URLSearchParams();
  if (limit) query.set('limit', String(limit));
  if (cursor) query.set('cursor', cursor);
  if (date) query.set('date', date);
  const qs = query.toString();
  return request(`/api/v1/merchants/${merchantId}/transactions${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

/**
 * Esnafın kendi fişini fiş numarasıyla (`Invoice.ID`) TAM iade etmesi (prototip).
 * Sunucu dört zincir işlemi yapar (esnaf/havuzlardan yakma, müşteriye basma);
 * yanıt ~15-25 sn sürebilir. Bkz. orchestrator `refund.service.js`.
 *
 * @param {string} merchantId
 * @param {string} apiKey
 * @param {string} documentNo
 * @returns {Promise<{documentNo: string, refundedAmount: string, customerAddress: string, refund: object}>}
 */
export async function refundByDocumentNo(merchantId, apiKey, documentNo) {
  return request(`/api/v1/merchants/${merchantId}/refunds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: { documentNo },
  });
}

/**
 * Müşterinin kendi iadeleri. Adres sahipliği imzayla kanıtlanır
 * (`KALEM-CUSTOMER-REFUNDS:{address}:{timestamp}`).
 *
 * @returns {Promise<{refunds: Array<{txHash: string, amount: string, documentNo: string|null, refundedAt: string}>}>}
 */
export async function getMyRefunds({ address, timestamp, signature }) {
  return request('/api/v1/customers/refunds', { method: 'POST', body: { address, timestamp, signature } });
}

/**
 * Müşterinin fiş geçmişi (önceki cihazlar dahil). Adres sahipliği imzayla
 * kanıtlanır (`KALEM-CUSTOMER-RECEIPTS:{address}:{timestamp}`).
 */
export async function getMyReceipts({ address, timestamp, signature }) {
  return request('/api/v1/customers/receipts', { method: 'POST', body: { address, timestamp, signature } });
}

/** Esnafın departmanları (kısımlar) ve izinli KDV oranları. */
export async function getDepartments(merchantId, apiKey) {
  return request(`/api/v1/merchants/${merchantId}/departments`, { headers: { Authorization: `Bearer ${apiKey}` } });
}

/** Departman listesini kaydeder: `[{ name, vatRate }]`. */
export async function saveDepartments(merchantId, apiKey, departments) {
  return request(`/api/v1/merchants/${merchantId}/departments`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: { departments },
  });
}
