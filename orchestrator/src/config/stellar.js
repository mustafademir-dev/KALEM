/**
 * Stellar ağ konfigürasyonu.
 *
 * Testnet ve Pubnet (gelecekte) arasında geçiş yapmak için tek nokta.
 * Stellar SDK nesnelerini (Networks, Server vb.) burada yapılandırır.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import config from './index.js';

/**
 * Ağ passphrase'ini döner.
 * Testnet: "Test SDF Network ; September 2015"
 */
function getNetworkPassphrase() {
  if (config.stellar.network === 'testnet') {
    return StellarSdk.Networks.TESTNET;
  }
  // Üretim fazında:
  // return StellarSdk.Networks.PUBLIC;
  return StellarSdk.Networks.TESTNET;
}

/**
 * Stellar Horizon sunucu instance'ı.
 * SSE dinleme ve işlem gönderimi için kullanılır.
 */
function createHorizonServer() {
  if (!config.stellar.horizonUrl) return null;
  return new StellarSdk.Horizon.Server(config.stellar.horizonUrl);
}

function createSorobanServer() {
  if (!config.stellar.sorobanRpcUrl) return null;
  return new StellarSdk.rpc.Server(config.stellar.sorobanRpcUrl);
}

const stellarConfig = {
  networkPassphrase: getNetworkPassphrase(),
  horizonServer: createHorizonServer(),
  sorobanServer: createSorobanServer(),
};

export default stellarConfig;
