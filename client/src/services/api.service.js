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
 * Üye işyerinin dTL bakiyesini sorgular (esnaf tarafı — kendi API anahtarıyla).
 *
 * @param {string} merchantId - Üye işyeri ID.
 * @param {string} apiKey - Esnafın API anahtarı.
 * @returns {Promise<{merchantId: string, stellarAddress: string, balance: string, currency: string}>}
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
