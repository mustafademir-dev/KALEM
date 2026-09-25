/**
 * Esnaf Departmanları (yazar kasalardaki "kısım" tuşları)
 *
 * GET /api/v1/merchants/:id/departments  → { departments, allowedVatRates }
 * PUT /api/v1/merchants/:id/departments  { departments: [{ name, vatRate }] }
 *
 * Esnaf departman ADLARINI ve sırasını düzenler; KDV oranı yalnızca esnafın izinli
 * oranlarından (`allowedVatRates`) seçilebilir. Gerçekte GİB yazar kasalarda oranları
 * faaliyet (NACE) koduna göre sabitler; burada izinli oranları operatör belirler.
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import Merchant from '../../models/Merchant.model.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { merchantReadRateLimiter } from '../middleware/rate-limit.middleware.js';
import { ALLOWED_VAT_RATES, isAllowedVatRate } from '../../utils/vat.js';
import logger from '../../utils/logger.js';

const router = Router();

export const DEFAULT_DEPARTMENTS = Object.freeze([
  { name: 'Genel', vatRate: 20 },
  { name: 'Gıda', vatRate: 10 },
  { name: 'Temel Gıda', vatRate: 1 },
]);
const MAX_DEPARTMENTS = 8;
const MAX_NAME = 24;

/** Esnafın izinli oranları (tanımlı değilse hepsi). */
export function allowedRatesOf(merchant) {
  const own = (merchant.allowedVatRates ?? []).filter(isAllowedVatRate);
  return own.length > 0 ? own : [...ALLOWED_VAT_RATES];
}

/** Esnafın kullanacağı departmanlar: kendi tanımı ya da varsayılan; izinsiz oranlılar ayıklanır. */
export function effectiveDepartments(merchant) {
  const allowed = allowedRatesOf(merchant);
  const source = merchant.departments?.length ? merchant.departments : DEFAULT_DEPARTMENTS;
  const list = source.filter((d) => allowed.includes(d.vatRate)).map((d) => ({ name: d.name, vatRate: d.vatRate }));
  return list.length > 0 ? list : [{ name: 'Genel', vatRate: allowed[0] }];
}

async function loadOwn(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Geçersiz üye işyeri id.' });
    return null;
  }
  if (req.merchantId !== id) {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Yalnızca kendi departmanlarınızı yönetebilirsiniz.' });
    return null;
  }
  const merchant = await Merchant.findById(id);
  if (!merchant) res.status(404).json({ error: 'NOT_FOUND', message: 'Üye işyeri bulunamadı.' });
  return merchant;
}

export async function getDepartmentsHandler(req, res) {
  try {
    const merchant = await loadOwn(req, res);
    if (!merchant) return;
    res.status(200).json({ departments: effectiveDepartments(merchant), allowedVatRates: allowedRatesOf(merchant) });
  } catch (error) {
    logger.error(`[Departments] get hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Departmanlar alınamadı.' });
  }
}

export async function putDepartmentsHandler(req, res) {
  try {
    const merchant = await loadOwn(req, res);
    if (!merchant) return;
    const allowed = allowedRatesOf(merchant);
    const input = req.body?.departments;
    if (!Array.isArray(input) || input.length < 1 || input.length > MAX_DEPARTMENTS) {
      return res
        .status(400)
        .json({ error: 'VALIDATION_ERROR', message: `1 ile ${MAX_DEPARTMENTS} arasında departman tanımlayın.` });
    }
    const seen = new Set();
    const departments = [];
    for (const d of input) {
      const name = typeof d?.name === 'string' ? d.name.trim() : '';
      if (!name || name.length > MAX_NAME) {
        return res
          .status(400)
          .json({ error: 'VALIDATION_ERROR', message: `Departman adı 1-${MAX_NAME} karakter olmalıdır.` });
      }
      if (seen.has(name.toLocaleLowerCase('tr'))) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: `"${name}" adı birden fazla kez kullanılmış.` });
      }
      if (!allowed.includes(d.vatRate)) {
        return res.status(400).json({
          error: 'VAT_RATE_NOT_ALLOWED',
          message: `"${name}" için %${d.vatRate} KDV oranı işletmenize tanımlı değil (izinli: ${allowed.map((r) => `%${r}`).join(', ')}).`,
        });
      }
      seen.add(name.toLocaleLowerCase('tr'));
      departments.push({ name, vatRate: d.vatRate });
    }
    merchant.departments = departments;
    await merchant.save();
    res.status(200).json({ departments, allowedVatRates: allowed });
  } catch (error) {
    logger.error(`[Departments] put hatası: ${error.message}`);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Departmanlar kaydedilemedi.' });
  }
}

router.get('/:id/departments', merchantReadRateLimiter, authMiddleware, getDepartmentsHandler);
router.put('/:id/departments', merchantReadRateLimiter, authMiddleware, putDepartmentsHandler);

export default router;
