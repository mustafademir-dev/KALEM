/**
 * Demo Musluk (Faucet) Servisi — YALNIZCA testnet/demo.
 *
 * PoC/demo akışında müşteri cüzdanına ilk dTL'yi verecek gerçek bir
 * lisanslı ödeme kuruluşu (PSP) entegrasyonu yok. Bu servis onun YERİNE
 * geçen bir demo kısayoludur: sunucu, `ISSUER_SECRET_KEY`'i kullanarak
 * doğrudan mint eder. Gerçek/mainnet dağıtımında bu servisin KENDİSİ
 * kaldırılmalı, yerine gerçek bir tahsilat/PSP entegrasyonu konmalıdır
 * (bkz. docs/ARCHITECTURE_DECISIONS.md §6.7).
 *
 * `merchant-onchain.service.js`'teki `registerMerchantOnChain()` ile AYNI
 * desen: ihraççı kendi anahtarıyla doğrudan imzalar, Fee-Bump YOK (bu da
 * mint gibi bir idari/operasyonel işlem, müşteri tarafından tetiklenen
 * bir ödeme değil — client sadece kendi adresine mint TALEP EDER, işlemin
 * kendisini imzalamaz).
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import stellarConfig from '../config/stellar.js';
import { buildContractCall, submitTransaction } from './stellar-tx.service.js';

/**
 * Verilen adrese sabit miktarda (config.faucet.mintAmountStroops) demo dTL mint eder.
 *
 * @param {string} customerAddress - Müşterinin Stellar adresi (G...).
 * @returns {Promise<{txHash: string, amount: string}>}
 */
export async function mintDemoDtl(customerAddress) {
  if (!customerAddress || !StellarSdk.StrKey.isValidEd25519PublicKey(customerAddress)) {
    throw new Error(`Geçersiz müşteri adresi: ${customerAddress}`);
  }
  if (!config.secrets.issuerSecretKey) {
    throw new Error('İhraççı gizli anahtarı yapılandırılmamış (ISSUER_SECRET_KEY).');
  }

  const issuerKeypair = StellarSdk.Keypair.fromSecret(config.secrets.issuerSecretKey);
  const amount = config.faucet.mintAmountStroops;

  logger.info(`[Faucet] Demo mint hazırlanıyor (müşteri: ${customerAddress}, tutar: ${amount} stroop)`);

  const preparedXdr = await buildContractCall({
    sourceAddress: issuerKeypair.publicKey(),
    contractId: config.contracts.dtlTokenId,
    method: 'mint',
    args: [
      StellarSdk.Address.fromString(customerAddress).toScVal(),
      StellarSdk.nativeToScVal(BigInt(amount), { type: 'i128' }),
    ],
  });

  const mintTx = StellarSdk.TransactionBuilder.fromXDR(preparedXdr, stellarConfig.networkPassphrase);
  mintTx.sign(issuerKeypair);

  const response = await submitTransaction(mintTx);

  logger.info(`[Faucet] Demo mint gönderildi (müşteri: ${customerAddress}, hash: ${response.hash})`);
  return { txHash: response.hash, amount };
}
