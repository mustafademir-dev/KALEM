/**
 * Girdi Doğrulama Middleware
 *
 * İstemciden gelen request body'lerinin beklenen formatta
 * olduğunu doğrular. XDR formatı, tutar değerleri vb.
 */

/**
 * İşlem gönderim request'inin doğrulaması.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateTransactionSubmit(req, res, next) {
  // TODO: Faz 2 Aşama 2.4'te implemente edilecek.
  // - signedXdr: string, boş değil, geçerli Base64
  // - merchantId: string, geçerli ObjectId
  // - totalAmount: string, pozitif sayı
  next();
}

/**
 * Üye işyeri kayıt request'inin doğrulaması.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateMerchantRegister(req, res, next) {
  // TODO: Faz 3'te implemente edilecek.
  // - businessName, taxId, stellarAddress: zorunlu string'ler
  next();
}
