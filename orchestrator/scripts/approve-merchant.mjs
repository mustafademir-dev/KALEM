#!/usr/bin/env node
/**
 * Esnaf Onay CLI Script'i (v2 — Müşteri→Esnaf Ödeme)
 *
 * Kullanım:
 *   node scripts/approve-merchant.mjs --taxId=<...> --operator="<isim>"
 *
 * Bilinçli tasarım kararı: `POST /merchants/register`, on-chain
 * `register_merchant()`'ı OTOMATİK tetiklemez. Esnaf adresleri artık
 * gerçek dTL alabildiği için bu, ayrı ve admin onaylı bir adımdır — bu
 * script, `ISSUER_SECRET_KEY`'e sahip bir operatör tarafından elle
 * çalıştırılır. Yeni bir admin-auth/RBAC alt sistemi İCAT EDİLMEMİŞTİR
 * (bilinçli kapsam kararı — bkz. ARCHITECTURE_DECISIONS.md §7).
 *
 * Güvenlik kontrolleri (sırayla):
 * 1. `ownershipVerified !== true` ise → REDDET (adres sahipliği kanıtlanmamış
 *    bir esnaf asla on-chain kaydedilmez).
 * 2. Gerçek on-chain duruma bakılır (MongoDB bayrağına DEĞİL) — zaten
 *    kayıtlıysa idempotent şekilde çıkılır, ikinci bir tx GÖNDERİLMEZ.
 * 3. Her deneme (başarılı/başarısız/zaten-kayıtlı) `MerchantApproval`
 *    koleksiyonuna denetim kaydı olarak yazılır: kim (`operator`),
 *    ne zaman, hangi esnaf, hangi sonuç.
 */

import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import config from '../src/config/index.js';
import logger from '../src/utils/logger.js';
import Merchant from '../src/models/Merchant.model.js';
import MerchantApproval from '../src/models/MerchantApproval.model.js';
import {
  registerMerchantOnChain,
  isMerchantAlreadyRegistered,
  openMerchantBalanceEntry,
} from '../src/services/merchant-onchain.service.js';

/**
 * `process.argv`'den `--key=value` biçimindeki argümanları ayrıştırır.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const match = raw.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args[match[1]] = match[2];
    }
  }
  return args;
}

/**
 * Tek bir esnaf onay/on-chain kayıt akışını çalıştırır. Mongoose
 * bağlantısının çağıran tarafından zaten kurulmuş olduğunu varsayar
 * (test edilebilirlik için — bkz. `test/approve-merchant.script.test.js`).
 *
 * @param {object} params
 * @param {string} params.taxId - Onaylanacak esnafın vergi kimlik numarası.
 * @param {string} params.operator - İşlemi tetikleyen operatörün adı (hesap verebilirlik).
 * @returns {Promise<{status: 'completed'|'already_registered'|'failed', merchantId?: string, registerTxHash?: string, message: string}>}
 */
export async function approveMerchant({ taxId, operator, openBalanceEntry = openMerchantBalanceEntry }) {
  if (!taxId || !taxId.trim()) {
    throw new Error('--taxId zorunludur.');
  }
  if (!operator || !operator.trim()) {
    throw new Error('--operator zorunludur (hesap verebilirlik için kim onayladığı kaydedilir).');
  }

  const merchant = await Merchant.findOne({ taxId });
  if (!merchant) {
    throw new Error(`Üye işyeri bulunamadı (taxId: ${taxId}).`);
  }

  // 1. Adres sahipliği kanıtlanmamışsa KESİNLİKLE onaylama.
  if (merchant.ownershipVerified !== true) {
    await MerchantApproval.create({
      merchant: merchant._id,
      operator,
      status: 'failed',
      errorMessage: 'ownershipVerified=false — adres sahipliği kanıtlanmamış esnaf on-chain kaydedilemez.',
    });
    logger.error(
      `[ApproveMerchant] REDDEDİLDİ — ${merchant.businessName} (${taxId}) adres sahipliğini kanıtlamamış.`
    );
    return {
      status: 'failed',
      merchantId: merchant._id.toString(),
      message: 'Reddedildi: ownershipVerified=false.',
    };
  }

  // 2. Gerçek on-chain duruma bak (MongoDB bayrağına değil) — idempotent davranış.
  const alreadyOnChain = await isMerchantAlreadyRegistered(merchant.stellarAddress);
  if (alreadyOnChain) {
    if (!merchant.onChainRegistered) {
      merchant.onChainRegistered = true;
      await merchant.save();
    }
    await MerchantApproval.create({
      merchant: merchant._id,
      operator,
      status: 'already_registered',
      notes: 'Zincirde zaten kayıtlıydı — yeni bir tx gönderilmedi (idempotent).',
    });
    logger.warn(
      `[ApproveMerchant] ZATEN KAYITLI — ${merchant.businessName} (${merchant.stellarAddress}), tx gönderilmedi.`
    );
    return {
      status: 'already_registered',
      merchantId: merchant._id.toString(),
      message: 'Esnaf zaten on-chain kayıtlı; ikinci bir işlem gönderilmedi.',
    };
  }

  // 3. Kilit + denetim izi: burn/pool-feed desenindeki gibi, işlemden ÖNCE 'pending' aç.
  const approval = await MerchantApproval.create({
    merchant: merchant._id,
    operator,
    status: 'pending',
  });

  try {
    const txHash = await registerMerchantOnChain(merchant.stellarAddress);

    merchant.kycStatus = 'verified';
    merchant.onChainRegistered = true;
    await merchant.save();

    approval.status = 'completed';
    approval.registerTxHash = txHash;
    await approval.save();

    logger.info(
      `[ApproveMerchant] ONAYLANDI — ${merchant.businessName} (${merchant.stellarAddress}), tx: ${txHash}`
    );

    // İlk müşteri ödemesi pahalı olmasın diye bakiye kaydını şimdi aç. Best-effort:
    // başarısız olursa onay GEÇERLİ kalır, yalnızca ilk ödeme kirayı öder.
    try {
      await openBalanceEntry(merchant.stellarAddress);
    } catch (error) {
      logger.warn(`[ApproveMerchant] Bakiye kaydı önceden açılamadı (ilk ödeme kirayı öder): ${error.message}`);
    }

    return {
      status: 'completed',
      merchantId: merchant._id.toString(),
      registerTxHash: txHash,
      message: 'Esnaf on-chain kaydedildi.',
    };
  } catch (error) {
    approval.status = 'failed';
    approval.errorMessage = error.message;
    await approval.save();
    logger.error(`[ApproveMerchant] on-chain kayıt hatası: ${error.message}`);
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await mongoose.connect(config.mongodbUri);
  try {
    const result = await approveMerchant({ taxId: args.taxId, operator: args.operator });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'failed' ? 1 : 0;
  } catch (error) {
    console.error('HATA:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main();
}
