/**
 * İşlem Servisi (Transaction Service)
 *
 * Bölüm 5.4.1: İç zarfın oluşturulması.
 *
 * - Soroban pool-manager.distribute() çağrısını XDR olarak oluşturur
 * - Ed25519 ile yerel imzalama (gas ücreti EKLENMez)
 * - İmzalı XDR paketini orkestrasyon katmanına iletim için hazırlar
 */

/**
 * Ödeme işlemi için iç zarfı (inner transaction) oluşturur ve imzalar.
 *
 * @param {object} params
 * @param {string} params.totalAmount - dTL tutarı (stroops).
 * @param {string} params.merchantId - Üye işyeri MongoDB ID'si.
 * @param {Array} params.cartItems - Sepet kalemleri (GİB eşlemesi için).
 * @returns {Promise<{signedXdr: string, idempotencyKey: string}>}
 *
 * Akış:
 * 1. wallet.service'den cüzdan bilgisini al
 * 2. Soroban SDK ile pool-manager.distribute() çağrısını XDR olarak oluştur
 *    - source: kullanıcı adresi
 *    - baseFee: 0 (gas eklenmez, Fee-Bump ekleyecek)
 * 3. wallet.service.signData() ile Ed25519 imzası ekle
 * 4. UUID v4 idempotency key üret
 * 5. { signedXdr, idempotencyKey } döndür
 */
export async function createPaymentTransaction({ totalAmount, merchantId, cartItems }) {
  // TODO: Faz 3 Aşama 3.4'te implemente edilecek.
  throw new Error('NOT_IMPLEMENTED');
}
