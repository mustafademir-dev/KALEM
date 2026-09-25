/**
 * Departman + KDV: oranlı matrah, fişte oran grupları, departman uçları.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import Merchant from '../src/models/Merchant.model.js';
import GibDocument from '../src/models/GibDocument.model.js';
import { hashApiKey } from '../src/utils/crypto.js';
import { kurusExcludingVat } from '../src/utils/money.js';
import { vatBreakdown, clampToAllowed } from '../src/utils/vat.js';
import { sanitizeCartItems } from '../src/utils/cart-items.js';
import { generateGibDocument } from '../src/services/gib-simulator.service.js';
import departmentRoutes, { effectiveDepartments } from '../src/api/routes/departments.routes.js';

const cents = (s) => Math.round(Number(s) * 100);

describe('KDV hesabı', () => {
  it('oranlı matrah: 110 TL %10 → 100 TL; 101 TL %1 → 100 TL; %20 eski hesapla aynı', () => {
    assert.equal(kurusExcludingVat(11000n, 10), 10000n);
    assert.equal(kurusExcludingVat(10100n, 1), 10000n);
    for (const k of [0n, 1n, 99n, 12345n, 600000n]) {
      assert.equal(kurusExcludingVat(k, 20), (k * 5n + 3n) / 6n);
      assert.equal(kurusExcludingVat(k), kurusExcludingVat(k, 20));
    }
  });

  it('karışık sepet: oran grupları, Σ grup = toplam, matrah + KDV = toplam', () => {
    const items = [
      { name: 'Ekmek', quantity: 2, price: '100000000', vatRate: 1 }, // 20 TL
      { name: 'Defter', quantity: 1, price: '300000000', vatRate: 20 }, // 30 TL
    ];
    const v = vatBreakdown('500000000', items);
    assert.equal(v.useCart, true);
    assert.deepEqual(v.groups.map((g) => g.rate), [1, 20]);
    assert.equal(v.groups.reduce((a, g) => a + g.inclKurus, 0n), 5000n);
    assert.equal(v.exclKurus + v.vatKurus, 5000n);
    assert.equal(v.groups[0].exclKurus, kurusExcludingVat(2000n, 1));
  });

  it('oransız ya da toplamla tutmayan sepet: eski davranış, tek grup %20', () => {
    assert.deepEqual(vatBreakdown('120000000', []).groups.map((g) => g.rate), [20]);
    assert.deepEqual(
      vatBreakdown('120000000', [{ name: 'x', quantity: 1, price: '1', vatRate: 1 }]).groups.map((g) => g.rate),
      [20]
    );
  });

  it('izinli olmayan oran izinliye çekilir; sepet temizliğinde geçersiz oran atılır', () => {
    assert.equal(clampToAllowed(1, [20]), 20);
    assert.equal(clampToAllowed(10, [1, 10]), 10);
    assert.equal(clampToAllowed(18, [1, 10]), 1);
    const [a, b] = sanitizeCartItems([
      { name: 'A', quantity: 1, price: '10', vatRate: 10 },
      { name: 'B', quantity: 1, price: '10', vatRate: 18 },
    ]);
    assert.equal(a.vatRate, 10);
    assert.equal(b.vatRate, undefined);
  });
});

describe('Fiş (GİB) ve departmanlar', () => {
  let mongod, server, baseUrl;

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());
    const app = express();
    app.use(express.json());
    app.use('/api/v1/merchants', departmentRoutes);
    await new Promise((r) => { server = app.listen(0, r); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    await mongod.stop();
  });
  beforeEach(async () => {
    await Promise.all([Merchant.deleteMany({}), GibDocument.deleteMany({})]);
  });

  it('departman satırı: fişte oran %10, matrah + KDV = toplam', async () => {
    const doc = await generateGibDocument({
      txHash: 'h1',
      transactionId: new mongoose.Types.ObjectId(),
      totalAmountStroops: '1100000000', // 110 TL
      cartItems: [{ name: 'Gıda', quantity: 1, price: '1100000000', vatRate: 10 }],
    });
    const inv = doc.ublContent.Invoice;
    assert.equal(inv.TaxTotal.TaxSubtotal[0].Percent, 10);
    assert.equal(inv.LegalMonetaryTotal.TaxExclusiveAmount, '100.00');
    assert.equal(inv.TaxTotal.TaxAmount, '10.00');
    assert.equal(inv.InvoiceLine[0].Item.Name, 'Gıda');
    assert.equal(inv.InvoiceLine[0].TaxTotal.TaxSubtotal.Percent, 10);
  });

  it('karışık sepet: iki oran grubu, satırlar grup matrahına kuruşu kuruşuna eşit', async () => {
    const doc = await generateGibDocument({
      txHash: 'h2',
      transactionId: new mongoose.Types.ObjectId(),
      totalAmountStroops: '333333333',
      cartItems: [
        { name: 'Simit', quantity: 3, price: '11111111', vatRate: 1 },
        { name: 'Kalem', quantity: 1, price: '300000000', vatRate: 20 },
      ],
    });
    const inv = doc.ublContent.Invoice;
    assert.deepEqual(inv.TaxTotal.TaxSubtotal.map((t) => t.Percent), [1, 20]);
    const linesSum = inv.InvoiceLine.reduce((a, l) => a + cents(l.LineExtensionAmount), 0);
    assert.equal(linesSum, cents(inv.LegalMonetaryTotal.TaxExclusiveAmount));
    assert.equal(
      cents(inv.LegalMonetaryTotal.TaxExclusiveAmount) + cents(inv.TaxTotal.TaxAmount),
      cents(inv.LegalMonetaryTotal.PayableAmount)
    );
  });

  it('esnafa izinsiz oran fişe yansımaz (QR yolda değiştirilse bile)', async () => {
    const doc = await generateGibDocument({
      txHash: 'h3',
      transactionId: new mongoose.Types.ObjectId(),
      totalAmountStroops: '1200000000',
      cartItems: [{ name: 'Sigara', quantity: 1, price: '1200000000', vatRate: 1 }],
      allowedVatRates: [20],
    });
    assert.equal(doc.ublContent.Invoice.TaxTotal.TaxSubtotal[0].Percent, 20);
  });

  async function merchantWithKey(extra = {}) {
    const apiKey = 'k-' + randomUUID();
    const merchant = await Merchant.create({
      businessName: 'Demo', taxId: 'T-' + randomUUID().slice(0, 6),
      stellarAddress: StellarSdk.Keypair.random().publicKey(),
      apiKeyHash: hashApiKey(apiKey), ownershipVerified: true, isActive: true, ...extra,
    });
    return { merchant, apiKey };
  }
  const call = (method, merchant, apiKey, body) =>
    fetch(`${baseUrl}/api/v1/merchants/${merchant._id}/departments`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

  it('tanımsız esnaf varsayılan departmanları alır; izinli oranlar dışındakiler ayıklanır', async () => {
    const { merchant, apiKey } = await merchantWithKey();
    const res = await call('GET', merchant, apiKey);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.departments.map((d) => d.vatRate), [20, 10, 1]);
    assert.deepEqual(effectiveDepartments({ allowedVatRates: [20] }), [{ name: 'Genel', vatRate: 20 }]);
  });

  it('departman kaydetme: geçerli liste kaydedilir; izinsiz oran, boş ad, tekrar eden ad reddedilir', async () => {
    const { merchant, apiKey } = await merchantWithKey({ allowedVatRates: [10, 20] });
    const ok = await call('PUT', merchant, apiKey, { departments: [{ name: 'Kırtasiye', vatRate: 20 }, { name: 'Kitap', vatRate: 10 }] });
    assert.equal(ok.status, 200);
    assert.deepEqual((await (await call('GET', merchant, apiKey)).json()).departments.map((d) => d.name), ['Kırtasiye', 'Kitap']);

    const bad = await call('PUT', merchant, apiKey, { departments: [{ name: 'Ekmek', vatRate: 1 }] });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, 'VAT_RATE_NOT_ALLOWED');
    assert.equal((await call('PUT', merchant, apiKey, { departments: [{ name: ' ', vatRate: 20 }] })).status, 400);
    assert.equal(
      (await call('PUT', merchant, apiKey, { departments: [{ name: 'A', vatRate: 20 }, { name: 'a', vatRate: 10 }] })).status,
      400
    );
    assert.equal((await call('PUT', merchant, apiKey, { departments: [] })).status, 400);
  });

  it('başka esnafın departmanları okunamaz/yazılamaz', async () => {
    const { merchant } = await merchantWithKey();
    const { apiKey: otherKey } = await merchantWithKey();
    assert.equal((await call('GET', merchant, otherKey)).status, 403);
  });
});
