/**
 * Metro Bundler Yapılandırması
 *
 * ## Neden var: `bignumber.js` web'de boş modül olarak çözülüyor
 *
 * `@stellar/stellar-sdk` (v16) `bignumber.js` v11'e bağımlıdır. Bu paketin
 * `package.json`'ındaki `exports` haritası üç koşul sunar:
 *
 *   require -> dist/bignumber.cjs   → `module.exports = BigNumber` (çalışır)
 *   import  -> dist/bignumber.mjs   → ESM named export (çalışır)
 *   browser -> dist/bignumber.js    → HİÇBİR ŞEY İHRAÇ ETMEZ; yalnızca
 *                                     `globalThis.BigNumber = BigNumber` atar
 *
 * Metro, web hedefinde `browser` koşulunu tercih ettiği için üçüncü dosyayı
 * alır ve modül boş görünür. Sonuç, uygulamanın açılışta beyaz ekranla
 * ölmesidir:
 *
 *   TypeError: _bignumber.default.clone is not a function
 *
 * Node tarafı (orchestrator) aynı sürümle sorunsuz çalışır, çünkü `require`
 * koşulu doğru dosyayı verir — yani bu, SDK'nın değil paketleme koşullarının
 * bir uyumsuzluğudur ve YALNIZCA web hedefini etkiler.
 *
 * ## Çözüm
 *
 * `bignumber.js` içe aktarmalarını doğrudan CommonJS derlemesine yönlendiririz.
 * Bu, sürüm düşürmekten (SDK `^11.1.4` istiyor) ve tüm paketler için `browser`
 * koşulunu kapatmaktan (başka paketlerin web uyumluluğunu bozardı) daha
 * dar kapsamlı ve güvenli bir müdahaledir.
 *
 * Bu kural, `bignumber.js` bu davranışı düzelttiğinde kaldırılabilir; kaldırmadan
 * önce web'de bir ödeme akışının uçtan uca çalıştığı doğrulanmalıdır.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const BIGNUMBER_CJS = path.resolve(__dirname, 'node_modules/bignumber.js/dist/bignumber.cjs');

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'bignumber.js') {
    return { type: 'sourceFile', filePath: BIGNUMBER_CJS };
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
