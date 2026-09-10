/**
 * Ağ Yardımcıları
 *
 * `trust proxy` yanlış yapılandırıldığında rate limiting'in IP katmanı sessizce
 * bozulur: `req.ip`, gerçek istemci yerine **altyapının kendi iç adresini**
 * döndürür ve o adres TÜM kullanıcılarda ortak olduğu için limitler "IP başına"
 * değil fiilen "küresel" çalışır — birkaç kullanıcı diğer herkesi kilitleyebilir.
 *
 * Bu, 10 Eylül 2026'da Render'da gerçekten yaşandı: `TRUST_PROXY_HOPS=1` iken
 * `req.ip` = `10.25.111.8` (Render iç yük dengeleyicisi) çözülüyordu. Zincirin
 * gerçek şekli şuydu:
 *
 *   88.253.38.157, 104.23.180.102, 10.25.111.8
 *      ↑ gerçek istemci   ↑ Cloudflare    ↑ Render iç ağı
 *
 * Arıza dışarıdan görünmez: uygulama sağlıklı log üretir, `/health` 200 döner,
 * yalnızca limitler yanlış sayar. Aşağıdaki tespit fonksiyonu bu sınıf hatayı
 * otomatik olarak görünür kılmak içindir.
 */

/**
 * Bir IP adresinin özel (RFC1918), loopback veya link-local olup olmadığını söyler.
 *
 * Rate limit anahtarı olarak çözülen adres bu sınıftaysa, bu neredeyse kesin
 * olarak `trust proxy` yanlış yapılandırmasıdır: gerçek bir istemci internet
 * üzerinden özel bir adresle gelemez.
 *
 * @param {string | null | undefined} ip
 * @returns {boolean}
 */
export function isPrivateOrLoopbackIp(ip) {
  if (!ip || typeof ip !== 'string') return false;

  // IPv6 formatına gömülü IPv4'ü ayıkla (ör. ::ffff:10.0.0.1)
  const normalized = ip.trim().toLowerCase().replace(/^::ffff:/, '');

  // --- IPv6 ---
  if (normalized === '::1') return true; // loopback
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // fc00::/7 unique-local
  if (/^fe80:/.test(normalized)) return true; // link-local

  // --- IPv4 ---
  const octets = normalized.split('.');
  if (octets.length !== 4) return false;

  const nums = octets.map((o) => Number(o));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;

  const [a, b] = nums;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local

  return false;
}
