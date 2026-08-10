/**
 * Kimlik Doğrulama Middleware
 *
 * İstemciden gelen isteklerin yetkili bir üye işyeri veya
 * sistem bileşeninden geldiğini doğrular.
 */

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function authMiddleware(req, res, next) {
  // TODO: Faz 3'te implemente edilecek.
  // - Bearer token veya API key doğrulaması
  // - req.merchantId ataması
  next();
}
