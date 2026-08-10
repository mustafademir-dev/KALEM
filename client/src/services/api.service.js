/**
 * API Servisi
 *
 * Orkestrasyon katmanı (Node.js) ile HTTP iletişimi.
 */

import { ORCHESTRATOR_BASE_URL } from '../utils/constants.js';

/**
 * İmzalı XDR paketini orkestrasyon katmanına gönderir.
 *
 * @param {object} params
 * @param {string} params.signedXdr - İmzalı iç zarf (Base64/XDR).
 * @param {string} params.idempotencyKey - UUID v4.
 * @param {string} params.merchantId - Üye işyeri ID.
 * @param {string} params.totalAmount - dTL tutarı.
 * @param {Array} params.cartItems - Sepet kalemleri.
 * @returns {Promise<object>} İşlem sonucu.
 */
export async function submitTransaction({
  signedXdr,
  idempotencyKey,
  merchantId,
  totalAmount,
  cartItems,
}) {
  // TODO: Faz 3 Aşama 3.4'te implemente edilecek.
  //
  // const response = await fetch(`${ORCHESTRATOR_BASE_URL}/api/v1/transactions/submit`, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'Idempotency-Key': idempotencyKey,
  //   },
  //   body: JSON.stringify({ signedXdr, merchantId, totalAmount, cartItems }),
  // });
  // return response.json();

  throw new Error('NOT_IMPLEMENTED');
}

/**
 * Üye işyerinin Havuz 1 dTL bakiyesini sorgular.
 *
 * @param {string} merchantId - Üye işyeri ID.
 * @returns {Promise<string>} dTL bakiyesi (stroops).
 */
export async function getMerchantBalance(merchantId) {
  // TODO: Faz 3'te implemente edilecek.
  throw new Error('NOT_IMPLEMENTED');
}
