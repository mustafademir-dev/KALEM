/**
 * Esnaf On-Chain Kayıt Servisi (v2 — Müşteri→Esnaf Ödeme)
 *
 * `POST /merchants/register` esnaf kaydını on-chain `register_merchant()`
 * çağrısını OTOMATİK TETİKLEMEZ (bkz. ARCHITECTURE_DECISIONS.md §7) —
 * bu bilinçli bir güvenlik kararıdır: esnaf adresleri artık gerçek dTL
 * alabildiği için, kim esnaf ilan edilebileceği anlık/kendinden-servis
 * bir REST çağrısına bırakılamaz. Bu dosyadaki fonksiyonlar yalnızca
 * `orchestrator/scripts/approve-merchant.mjs` (admin onaylı CLI script)
 * tarafından çağrılır.
 *
 * `pool-feeder.service.js`'teki `burnPool4Dtl()` ile AYNI desen: ihraççı
 * (admin) kendi anahtarıyla doğrudan imzalar ve kendi ücretini öder —
 * Fee-Bump YOK (mint/burn gibi bir operasyonel/idari işlemdir, müşteri
 * tarafından tetiklenen bir ödeme değildir).
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import logger from '../utils/logger.js';
import config from '../config/index.js';
import stellarConfig from '../config/stellar.js';
import { buildContractCall, submitTransaction, isMerchantOnChain } from './stellar-tx.service.js';

/**
 * Verilen adresi dtl-token kontratında esnaf olarak kaydeder.
 *
 * @param {string} merchantStellarAddress - Esnafın Stellar adresi (G...).
 * @returns {Promise<string>} register_merchant işleminin tx hash'i.
 */
export async function registerMerchantOnChain(merchantStellarAddress) {
  try {
    if (!merchantStellarAddress || !StellarSdk.StrKey.isValidEd25519PublicKey(merchantStellarAddress)) {
      throw new Error(`Geçersiz esnaf adresi: ${merchantStellarAddress}`);
    }
    if (!config.secrets.issuerSecretKey) {
      throw new Error('İhraççı gizli anahtarı yapılandırılmamış (ISSUER_SECRET_KEY).');
    }

    const issuerKeypair = StellarSdk.Keypair.fromSecret(config.secrets.issuerSecretKey);

    logger.info(
      `[MerchantOnChain] register_merchant hazırlanıyor (esnaf: ${merchantStellarAddress})`
    );

    const preparedXdr = await buildContractCall({
      sourceAddress: issuerKeypair.publicKey(),
      contractId: config.contracts.dtlTokenId,
      method: 'register_merchant',
      args: [StellarSdk.Address.fromString(merchantStellarAddress).toScVal()],
    });

    const registerTx = StellarSdk.TransactionBuilder.fromXDR(preparedXdr, stellarConfig.networkPassphrase);
    registerTx.sign(issuerKeypair);

    const response = await submitTransaction(registerTx);

    logger.info(
      `[MerchantOnChain] Esnaf on-chain kaydedildi (esnaf: ${merchantStellarAddress}, hash: ${response.hash})`
    );
    return response.hash;
  } catch (error) {
    logger.error(`[MerchantOnChain] registerMerchantOnChain hatası: ${error.message}`);
    throw error;
  }
}

/**
 * Verilen adresin dtl-token kontratında ZATEN kayıtlı esnaf olup olmadığını
 * gerçek zincir durumuna bakarak kontrol eder (MongoDB bayrağına güvenmez).
 *
 * @param {string} merchantStellarAddress - Esnafın Stellar adresi (G...).
 * @returns {Promise<boolean>}
 */
export async function isMerchantAlreadyRegistered(merchantStellarAddress) {
  return isMerchantOnChain(config.contracts.dtlTokenId, merchantStellarAddress);
}

/**
 * Esnafın dtl-token bakiye kaydını ÖNCEDEN açar: 1 stroop basar ve hemen geri yakar.
 *
 * Neden: bir adrese İLK kez e-TL geldiğinde kontrat zincirde yeni bir bakiye kaydı
 * açar ve bunun kirası (~1-2 XLM) o işlemin ücretine eklenir. Bu adım yapılmazsa
 * bedeli esnafa gelen ilk müşteri ödemesi öder: pahalı ve ücret tavanına takılabilir.
 * Onay sırasında açılınca bedeli ihraççı bir kez öder, ilk müşteri ödemesi ucuz geçer.
 * Toplam arz değişmez (basılan = yakılan).
 *
 * Sınır: kontrat bakiye kaydını 30 günlük TTL ile yazar; esnaf 30 gün ödeme almazsa
 * kayıt arşivlenir ve bir sonraki ödeme yine kira öder.
 *
 * @returns {Promise<{mintTxHash: string, burnTxHash: string}>}
 */
export async function openMerchantBalanceEntry(merchantStellarAddress, { issuerCall } = {}) {
  const call = issuerCall ?? (await import('./refund.service.js')).issuerTokenCall;
  const mintTxHash = await call('mint', merchantStellarAddress, '1');
  const burnTxHash = await call('burn', merchantStellarAddress, '1');
  logger.info(`[MerchantOnChain] Esnaf bakiye kaydı açıldı (esnaf: ${merchantStellarAddress})`);
  return { mintTxHash, burnTxHash };
}
