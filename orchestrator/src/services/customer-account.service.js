/**
 * Müşteri hesabı: TC + 6 haneli PIN ile kayıt/giriş ve cihaz değişiminde bakiye taşıma.
 *
 * Cüzdan anahtarı cihazda kalır; hesap yalnızca "bu kişinin şu anki cüzdanı şu
 * adres" bilgisini tutar. Müşteri yeni bir cihazda (yeni cüzdanla) giriş yapınca
 * eski adresteki bakiye ihraççı yetkisiyle yeni adrese taşınır: eskiden yakılır,
 * yeniye basılır (iadeyle aynı mekanizma — refund.service.js). Bir e-para
 * kuruluşunun kimlik doğrulamalı hesap kurtarması da budur.
 *
 * TEK AKTİF CİHAZ: en son giriş yapılan cihaz hesabın cüzdanıdır. Eski cihazdan
 * tekrar giriş yapılırsa bakiye oraya geri taşınır.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import config from '../config/index.js';
import Customer from '../models/Customer.model.js';
import logger from '../utils/logger.js';
import { buildCustomerAuthChallenge } from '../utils/crypto.js';
import {
  hashSecret,
  verifySecret,
  isValidTcKimlik,
  hashTcKimlik,
  lockedMinutesLeft,
  registerFailedLogin,
  clearFailedLogins,
} from '../utils/credentials.js';
import { readContractBalance } from './stellar-tx.service.js';
import { issuerTokenCall, issuerBatchCall } from './refund.service.js';

export class AccountError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000;
const WRONG_CREDENTIALS = 'TC kimlik numarası veya PIN hatalı.';

/**
 * Bir cüzdan adresinin sahibinin TÜM adresleri (şu anki + önceki cihazlar).
 * Adres bir hesaba bağlı değilse yalnızca kendisi.
 */
export async function customerAddresses(address) {
  const customer = await Customer.findOne({ stellarAddress: address }).select('stellarAddress addressHistory').lean();
  return customer ? [customer.stellarAddress, ...(customer.addressHistory ?? [])] : [address];
}

const defaultDeps = {
  readBalance: (address) => readContractBalance(config.contracts.dtlTokenId, address),
  issuerCall: issuerTokenCall,
  // Tanımlıysa bakiye taşıma tek atomik işlemdir; değilse burn ve mint ayrı işlemler.
  get issuerBatch() {
    return config.contracts.issuerBatchId ? issuerBatchCall : null;
  },
};

/** Girdi biçimi + cihazdaki cüzdanın sahiplik imzası. */
function validateInput({ tc, pin, address, timestamp, signature }) {
  if (!isValidTcKimlik(tc)) throw new AccountError('VALIDATION_ERROR', 'Geçerli bir TC kimlik numarası girin.', 400);
  if (!/^\d{6}$/.test(String(pin ?? ''))) throw new AccountError('VALIDATION_ERROR', 'PIN 6 haneli olmalıdır.', 400);
  if (!address || !StellarSdk.StrKey.isValidEd25519PublicKey(address)) {
    throw new AccountError('VALIDATION_ERROR', 'Geçersiz cüzdan adresi.', 400);
  }
  if (typeof timestamp !== 'number' || Math.abs(Date.now() - timestamp) > CHALLENGE_MAX_AGE_MS) {
    throw new AccountError('VALIDATION_ERROR', 'İstek zaman aşımına uğradı, tekrar deneyin.', 400);
  }
  let ok = false;
  try {
    ok = StellarSdk.Keypair.fromPublicKey(address).verify(
      Buffer.from(buildCustomerAuthChallenge(address, timestamp), 'utf8'),
      Buffer.from(String(signature ?? ''), 'base64')
    );
  } catch {
    ok = false;
  }
  if (!ok) throw new AccountError('OWNERSHIP_PROOF_FAILED', 'Cüzdan doğrulanamadı.', 403);
}

/** Yeni müşteri hesabı. */
export async function registerCustomer(input) {
  validateInput(input);
  const tcHash = hashTcKimlik(input.tc);
  if (await Customer.exists({ tcHash })) {
    throw new AccountError('ALREADY_REGISTERED', 'Bu TC kimlik numarasıyla bir hesap zaten var. Giriş yapın.', 409);
  }
  if (await Customer.exists({ stellarAddress: input.address })) {
    throw new AccountError('ALREADY_REGISTERED', 'Bu cihazdaki cüzdan başka bir hesaba bağlı.', 409);
  }
  try {
    await Customer.create({ tcHash, pinHash: hashSecret(input.pin), stellarAddress: input.address });
  } catch (error) {
    if (error.code === 11000) {
      throw new AccountError('ALREADY_REGISTERED', 'Bu TC kimlik numarasıyla bir hesap zaten var. Giriş yapın.', 409);
    }
    throw error;
  }
  logger.info('[Customer] Yeni müşteri hesabı açıldı.');
  return { address: input.address };
}

/**
 * Giriş. Cihazdaki cüzdan hesaptakinden farklıysa (yeni telefon) bakiye taşınır.
 *
 * @returns {Promise<{address: string, migratedAmount: string|null}>}
 */
export async function loginCustomer(input, deps = defaultDeps) {
  validateInput(input);
  const customer = await Customer.findOne({ tcHash: hashTcKimlik(input.tc) }).select('+pinHash');
  if (!customer) throw new AccountError('INVALID_CREDENTIALS', WRONG_CREDENTIALS, 401);

  const minutes = lockedMinutesLeft(customer);
  if (minutes > 0) {
    throw new AccountError('LOCKED', `Çok fazla hatalı deneme. ${minutes} dakika sonra tekrar deneyin.`, 423);
  }
  if (!verifySecret(input.pin, customer.pinHash)) {
    await registerFailedLogin(customer);
    throw new AccountError('INVALID_CREDENTIALS', WRONG_CREDENTIALS, 401);
  }
  await clearFailedLogins(customer);

  if (customer.stellarAddress === input.address && !customer.pendingMigration) {
    return { address: customer.stellarAddress, migratedAmount: null };
  }
  return migrateToNewDevice(customer, input.address, deps);
}

/**
 * Eski cüzdandaki bakiyeyi yeni cüzdana taşır. `issuer-batch` tanımlıysa yakma ve
 * basma TEK atomik işlemdir. Değilse (yedek yol): önce eskiden YAKILIR ve bu
 * kaydedilir; sonra yeniye BASILIR. Basma adımı başarısız olursa yakılan tutar
 * `pendingMigration`'da kalır ve bir sonraki girişte yeni cihaza basılır —
 * para kaybolmaz, iki kez de basılmaz.
 */
async function migrateToNewDevice(customer, newAddress, deps) {
  if (newAddress !== customer.stellarAddress && (await Customer.exists({ stellarAddress: newAddress }))) {
    throw new AccountError('ALREADY_REGISTERED', 'Bu cihazdaki cüzdan başka bir hesaba bağlı.', 409);
  }

  let pending = customer.pendingMigration;
  let migratedAmount = null;
  if (!pending && newAddress !== customer.stellarAddress && deps.issuerBatch) {
    // Tek atomik işlem: eskiden yakma + yeniye basma birlikte olur ya da hiç olmaz;
    // arada kalma (pendingMigration) durumu doğmaz ve süre bir ledger kapanışına iner.
    const balance = BigInt(await deps.readBalance(customer.stellarAddress));
    if (balance > 0n) {
      const txHash = await deps.issuerBatch({
        burns: [{ address: customer.stellarAddress, amount: balance.toString() }],
        mints: [{ address: newAddress, amount: balance.toString() }],
      });
      migratedAmount = balance.toString();
      logger.info(`[Customer] Cihaz değişimi: ${balance} stroop tek işlemde taşındı (${txHash}).`);
    }
  } else if (!pending && newAddress !== customer.stellarAddress) {
    const balance = BigInt(await deps.readBalance(customer.stellarAddress));
    if (balance > 0n) {
      const burnTxHash = await deps.issuerCall('burn', customer.stellarAddress, balance.toString());
      pending = { from: customer.stellarAddress, amount: balance.toString(), burnTxHash, at: new Date() };
      customer.pendingMigration = pending;
      await customer.save();
      logger.info(`[Customer] Cihaz değişimi: eski cüzdandan ${balance} stroop yakıldı (${burnTxHash}).`);
    }
  }

  if (pending) {
    await deps.issuerCall('mint', newAddress, pending.amount);
    migratedAmount = pending.amount;
    logger.info(`[Customer] Cihaz değişimi: yeni cüzdana ${pending.amount} stroop basıldı.`);
  }

  if (customer.stellarAddress !== newAddress && !customer.addressHistory.includes(customer.stellarAddress)) {
    customer.addressHistory.push(customer.stellarAddress);
  }
  customer.stellarAddress = newAddress;
  customer.pendingMigration = undefined;
  await customer.save();
  return { address: newAddress, migratedAmount };
}
