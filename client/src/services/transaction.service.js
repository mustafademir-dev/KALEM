/**
 * İşlem Servisi (Transaction Service)
 *
 * Bölüm 5.4.1: İç zarfın oluşturulması.
 *
 * - Soroban pool-manager.pay_merchant() çağrısını XDR olarak oluşturur
 *   (Havuz 1'e değil, doğrudan esnafın adresine — v2 Müşteri→Esnaf Ödeme)
 * - Soroban RPC ile prepareTransaction (simulate + assemble) çalıştırır
 *   (bu adım atlanırsa 'insufficient resources' hatası alınır)
 * - Ed25519 ile yerel imzalama (wallet.service.signData — gizli anahtar
 *   bu dosyaya HİÇ girmez, yalnızca imza sonucu döner)
 * - baseFee olarak yalnızca ağın minimum taban ücreti kullanılır (gas
 *   EKLENMEZ) — gerçek ağ ücretini orchestrator'daki Fee-Bump (Havuz 2)
 *   üstlenir; bu yüzden müşteri cüzdanında hiç XLM olmasa da işlem geçer.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import * as Crypto from 'expo-crypto';
import {
  SOROBAN_RPC_URL,
  HORIZON_URL,
  STELLAR_NETWORK_PASSPHRASE,
  POOL_MANAGER_CONTRACT_ID,
} from '../utils/constants.js';
import { signData, bytesToBase64 } from './wallet.service.js';

const sorobanServer = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);
const horizonServer = new StellarSdk.Horizon.Server(HORIZON_URL);

/** İç zarfın geçerlilik süresi (saniye) — sonsuz timebounds bırakılmaz. */
const INNER_TX_TIMEOUT_SECONDS = 180;

/**
 * Ödeme işlemi için iç zarfı (inner transaction) oluşturur ve imzalar.
 *
 * @param {object} params
 * @param {string} params.senderAddress - Müşterinin Stellar adresi (G...).
 * @param {string} params.merchantStellarAddress - Esnafın Stellar adresi (QR'dan).
 * @param {string} params.totalAmount - dTL tutarı (stroop, string).
 * @returns {Promise<{signedXdr: string, idempotencyKey: string, innerTxHash: string}>}
 */
export async function createPaymentTransaction({ senderAddress, merchantStellarAddress, totalAmount }) {
  const account = await horizonServer.loadAccount(senderAddress);
  const contract = new StellarSdk.Contract(POOL_MANAGER_CONTRACT_ID);

  const operation = contract.call(
    'pay_merchant',
    StellarSdk.Address.fromString(senderAddress).toScVal(),
    StellarSdk.Address.fromString(merchantStellarAddress).toScVal(),
    StellarSdk.nativeToScVal(BigInt(totalAmount), { type: 'i128' })
  );

  const rawTx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(INNER_TX_TIMEOUT_SECONDS)
    .build();

  const prepared = await sorobanServer.prepareTransaction(rawTx);

  const innerTxHash = prepared.hash();
  const signature = await signData(innerTxHash);
  // Transaction.addSignature() hem hint'i hesaplar hem de imzayı hash'e
  // karşı doğrular (this.hash() ile) — client'ta bozuk bir imzayı ağa
  // gitmeden önce yakalar.
  prepared.addSignature(senderAddress, bytesToBase64(signature));

  return {
    signedXdr: prepared.toXDR(),
    idempotencyKey: Crypto.randomUUID(),
    innerTxHash: innerTxHash.toString('hex'),
  };
}
