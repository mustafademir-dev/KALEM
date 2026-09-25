/**
 * Esnaf raporlama uçları (dashboard / transactions / reports/daily) — gerçek Express +
 * gerçek (bellek-içi) MongoDB replica set; yalnızca Stellar RPC mock'lanır.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import Merchant from '../src/models/Merchant.model.js';
import Transaction from '../src/models/Transaction.model.js';
import GibDocument from '../src/models/GibDocument.model.js';
import { hashApiKey } from '../src/utils/crypto.js';
import merchantReportRoutes from '../src/api/routes/merchant-reports.routes.js';
import {
  istanbulDayRange,
  istanbulToday,
  csvText,
  resetSocialFundCache,
} from '../src/services/merchant-report.service.js';

const HASH = (n) => String(n).padStart(64, '0');

async function createMerchant(overrides = {}) {
  const apiKey = 'test-api-key-' + randomUUID();
  const merchant = await Merchant.create({
    businessName: 'Kadıköy Simit Fırını',
    taxId: 'TAX-' + randomUUID().slice(0, 10),
    stellarAddress: StellarSdk.Keypair.random().publicKey(),
    apiKeyHash: hashApiKey(apiKey),
    ownershipVerified: true,
    isActive: true,
    onChainRegistered: true,
    kycStatus: 'verified',
    ...overrides,
  });
  return { merchant, apiKey };
}

let hashCounter = 0;
/** Onaylı bir işlem yazar. `breakdown` verilirse pool tutarları da yazılır. */
async function createTx(merchant, { total, breakdown, createdAt = new Date(), status = 'confirmed', gib } = {}) {
  hashCounter += 1;
  const tx = await Transaction.create({
    idempotencyKey: randomUUID(),
    senderAddress: StellarSdk.Keypair.random().publicKey(),
    merchantId: merchant._id,
    totalAmount: total,
    status,
    txHash: HASH(hashCounter),
    createdAt,
    ...(breakdown ? { pool1Amount: breakdown[0], pool3Amount: breakdown[1], pool4Amount: breakdown[2] } : {}),
  });
  if (gib) {
    const doc = await GibDocument.create({
      transactionId: tx._id,
      txHash: tx.txHash,
      ublContent: { Invoice: { ID: gib } },
      status: 'generated',
    });
    tx.gibDocumentId = doc._id;
    await tx.save();
  }
  return tx;
}

// 100 TL: esnaf %99,6 / sosyal fon %0,1 / operasyonel %0,3 (stroop)
const HUNDRED = { total: '1000000000', breakdown: ['996000000', '1000000', '3000000'] };

describe('Esnaf raporlama uçları', () => {
  let mongod;
  let server;
  let baseUrl;
  let originalSoroban;
  let originalPool3;

  const get = (path, apiKey) =>
    fetch(`${baseUrl}/api/v1/merchants${path}`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());
    await Transaction.init(); // bileşik indeksin kurulduğundan emin ol

    const app = express();
    app.use(express.json());
    app.use('/api/v1/merchants', merchantReportRoutes);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    originalSoroban = stellarConfig.sorobanServer;
    originalPool3 = config.pools.pool3Address;
    config.pools.pool3Address = StellarSdk.Keypair.random().publicKey();
  });

  after(async () => {
    stellarConfig.sorobanServer = originalSoroban;
    config.pools.pool3Address = originalPool3;
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([Merchant.deleteMany({}), Transaction.deleteMany({}), GibDocument.deleteMany({})]);
    resetSocialFundCache();
    stellarConfig.sorobanServer = {
      simulateTransaction: async () => ({
        transactionData: {},
        result: { retval: StellarSdk.nativeToScVal('777000000', { type: 'i128' }) },
      }),
    };
  });

  describe('yetki', () => {
    it('Bearer yoksa 401; başka esnafın id\'si için 403; bozuk id için 400', async () => {
      const { merchant, apiKey } = await createMerchant();
      const { merchant: other } = await createMerchant();
      for (const path of ['dashboard', 'transactions', 'reports/daily']) {
        assert.equal((await get(`/${merchant._id}/${path}`)).status, 401, `${path}: anahtarsız`);
        assert.equal((await get(`/${other._id}/${path}`, apiKey)).status, 403, `${path}: başkasının verisi`);
        assert.equal((await get(`/not-an-id/${path}`, apiKey)).status, 400, `${path}: bozuk id`);
      }
    });
  });

  describe('GET /:id/dashboard', () => {
    it('bugünkü özet: brüt/komisyon/net doğru; eksik verili işlem toplamlara girmez ve sayılır; başkası/başarısız/dünkü hariç', async () => {
      const { merchant, apiKey } = await createMerchant();
      const { merchant: other } = await createMerchant();

      await createTx(merchant, HUNDRED); // bugün, dağılımlı
      await createTx(merchant, { total: '50000000' }); // bugün, dağılım VERİSİ YOK (5 TL)
      await createTx(merchant, { ...HUNDRED, status: 'failed' }); // başarısız → sayılmaz
      await createTx(merchant, { ...HUNDRED, status: 'submitted' }); // onaylanmamış → sayılmaz
      await createTx(other, HUNDRED); // başka esnaf → sayılmaz
      await createTx(merchant, { ...HUNDRED, createdAt: new Date(Date.now() - 30 * 3600 * 1000) }); // dün/evvelsi

      const res = await get(`/${merchant._id}/dashboard`, apiKey);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(body.merchant.businessName, 'Kadıköy Simit Fırını');
      assert.equal(body.today.date, istanbulToday());
      assert.equal(body.today.count, 2);
      assert.equal(body.today.gross, '1050000000'); // 100 + 5 TL
      assert.equal(body.today.commission, '4000000'); // yalnızca dağılımlı işlemden
      assert.equal(body.today.net, '996000000');
      assert.equal(body.today.socialFund, '1000000');
      assert.equal(body.today.breakdownCount, 1);
      assert.equal(body.today.missingBreakdownCount, 1);

      // Sosyal Fon: esnafın tüm zamanlardaki katkısı (bugünkü + dünkü, dağılımlı) ve zincirdeki toplam
      assert.equal(body.socialFund.yourContribution, '2000000');
      assert.equal(body.socialFund.contributionTxCount, 2);
      assert.equal(body.socialFund.total, '777000000');
      assert.equal(body.balance, '777000000');
    });

    it('son işlemler yeniden eskiye; dağılımsız satırda komisyon/net null ("veri yok"); GİB belge no gelir', async () => {
      const { merchant, apiKey } = await createMerchant();
      const now = Date.now();
      await createTx(merchant, { ...HUNDRED, createdAt: new Date(now - 3000), gib: 'KALEM2026091912345' });
      await createTx(merchant, { total: '50000000', createdAt: new Date(now - 2000) });
      await createTx(merchant, { total: '20000000', createdAt: new Date(now - 1000) });

      const body = await (await get(`/${merchant._id}/dashboard`, apiKey)).json();
      assert.deepEqual(body.recent.map((r) => r.totalAmount), ['20000000', '50000000', '1000000000']);

      const noData = body.recent[0];
      assert.equal(noData.hasBreakdown, false);
      assert.equal(noData.commission, null);
      assert.equal(noData.net, null);
      assert.equal(noData.socialFund, null);
      assert.equal(noData.hasGibDocument, false);
      assert.equal(noData.gibDocumentNo, null);

      const full = body.recent[2];
      assert.equal(full.hasBreakdown, true);
      assert.equal(full.commission, '4000000'); // pool3 + pool4
      assert.equal(full.net, '996000000');
      assert.equal(full.hasGibDocument, true);
      assert.equal(full.gibDocumentNo, 'KALEM2026091912345');
    });

    it('zincir okuması başarısız olsa da 200 döner: bakiye ve Sosyal Fon toplamı null', async () => {
      const { merchant, apiKey } = await createMerchant();
      await createTx(merchant, HUNDRED);
      stellarConfig.sorobanServer = { simulateTransaction: async () => ({ error: 'HostError' }) };

      const res = await get(`/${merchant._id}/dashboard`, apiKey);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.balance, null);
      assert.equal(body.socialFund.total, null);
      assert.equal(body.today.count, 1, 'veritabanı verisi yine de gelir');
      assert.equal(body.socialFund.yourContribution, '1000000');
    });

    it('hiç işlemi olmayan esnaf: sıfırlar, boş liste', async () => {
      const { merchant, apiKey } = await createMerchant();
      const body = await (await get(`/${merchant._id}/dashboard`, apiKey)).json();
      assert.equal(body.today.count, 0);
      assert.equal(body.today.gross, '0');
      assert.deepEqual(body.recent, []);
      assert.equal(body.socialFund.yourContribution, '0');
    });

    it('Sosyal Fon bakiyesi 30 sn önbelleklenir (ikinci istek RPC\'ye gitmez)', async () => {
      const { merchant, apiKey } = await createMerchant();
      let calls = 0;
      stellarConfig.sorobanServer = {
        simulateTransaction: async () => {
          calls += 1;
          return { transactionData: {}, result: { retval: StellarSdk.nativeToScVal('500', { type: 'i128' }) } };
        },
      };
      await get(`/${merchant._id}/dashboard`, apiKey);
      const afterFirst = calls; // esnaf bakiyesi + fon bakiyesi
      await get(`/${merchant._id}/dashboard`, apiKey);
      assert.equal(calls - afterFirst, 1, 'ikinci istekte yalnızca esnaf bakiyesi okunur; fon önbellekten gelir');
    });
  });

  describe('GET /:id/transactions', () => {
    it('sayfalama: cursor ile tekrarsız, yeniden eskiye; son sayfada nextCursor null', async () => {
      const { merchant, apiKey } = await createMerchant();
      const base = Date.now();
      for (let i = 0; i < 5; i += 1) await createTx(merchant, { total: String((i + 1) * 10000000), createdAt: new Date(base - i * 1000) });
      // Aynı milisaniyede iki işlem: _id ile sıra bozulmamalı
      await createTx(merchant, { total: '990000000', createdAt: new Date(base - 2500) });
      await createTx(merchant, { total: '991000000', createdAt: new Date(base - 2500) });

      const seen = [];
      let cursor = null;
      let pages = 0;
      do {
        const q = `?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const body = await (await get(`/${merchant._id}/transactions${q}`, apiKey)).json();
        seen.push(...body.items.map((i) => i.id));
        cursor = body.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);

      assert.equal(seen.length, 7);
      assert.equal(new Set(seen).size, 7, 'hiçbir işlem iki kez gelmemeli');
      assert.equal(pages, 3); // 3 + 3 + 1
    });

    it('sıralama createdAt azalan; limit 1-50 aralığına kırpılır; yalnızca kendi onaylı işlemleri', async () => {
      const { merchant, apiKey } = await createMerchant();
      const { merchant: other } = await createMerchant();
      const now = Date.now();
      await createTx(merchant, { total: '10000000', createdAt: new Date(now - 2000) });
      await createTx(merchant, { total: '20000000', createdAt: new Date(now - 1000) });
      await createTx(merchant, { total: '30000000', status: 'pending' });
      await createTx(other, { total: '40000000' });

      const body = await (await get(`/${merchant._id}/transactions?limit=9999`, apiKey)).json();
      assert.deepEqual(body.items.map((i) => i.totalAmount), ['20000000', '10000000']);
      assert.equal(body.nextCursor, null);

      const tiny = await (await get(`/${merchant._id}/transactions?limit=0`, apiKey)).json();
      assert.equal(tiny.items.length, 1, 'limit en az 1');
    });

    it('bozuk cursor / geçersiz tarih 400', async () => {
      const { merchant, apiKey } = await createMerchant();
      assert.equal((await get(`/${merchant._id}/transactions?cursor=zzz`, apiKey)).status, 400);
      for (const bad of ['abc', '2026-02-31', '2026-13-01', '19-09-2026']) {
        assert.equal((await get(`/${merchant._id}/transactions?date=${bad}`, apiKey)).status, 400, bad);
      }
    });

    it('TÜRKİYE SAATİ gün sınırı (UTC+3): 00:00 ve 23:59:59 doğru güne düşer', async () => {
      const { merchant, apiKey } = await createMerchant();
      await createTx(merchant, { total: '10000000', createdAt: new Date('2026-09-18T20:59:59.000Z') }); // 18 Eylül 23:59:59 TR
      await createTx(merchant, { total: '20000000', createdAt: new Date('2026-09-18T21:00:00.000Z') }); // 19 Eylül 00:00:00 TR
      await createTx(merchant, { total: '30000000', createdAt: new Date('2026-09-19T20:59:59.000Z') }); // 19 Eylül 23:59:59 TR
      await createTx(merchant, { total: '40000000', createdAt: new Date('2026-09-19T21:00:00.000Z') }); // 20 Eylül 00:00:00 TR

      const day19 = await (await get(`/${merchant._id}/transactions?date=2026-09-19`, apiKey)).json();
      assert.deepEqual(day19.items.map((i) => i.totalAmount).sort(), ['20000000', '30000000']);
      // Gün özeti, sayfa değil o günün TAMAMI üzerinden (limit=1 olsa bile)
      const paged = await (await get(`/${merchant._id}/transactions?date=2026-09-19&limit=1`, apiKey)).json();
      assert.equal(paged.items.length, 1);
      assert.ok(paged.nextCursor);
      assert.equal(paged.summary.date, '2026-09-19');
      assert.equal(paged.summary.count, 2);
      assert.equal(paged.summary.gross, '50000000');
      // Gün filtresi yoksa özet yok
      assert.equal((await (await get(`/${merchant._id}/transactions`, apiKey)).json()).summary, undefined);
      const day18 = await (await get(`/${merchant._id}/transactions?date=2026-09-18`, apiKey)).json();
      assert.deepEqual(day18.items.map((i) => i.totalAmount), ['10000000']);
    });
  });

  describe('GET /:id/reports/daily (gün sonu CSV)', () => {
    async function csvFor(apiKey, merchant, date) {
      const res = await get(`/${merchant._id}/reports/daily?date=${date}`, apiKey);
      const bytes = new Uint8Array(await res.arrayBuffer());
      // fetch().text() BOM'u standart gereği soyar; BOM'u HAM baytlardan doğrularız.
      return { res, bytes, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) };
    }

    it('CSV: UTF-8 BOM, ; ayraç, virgüllü ondalık, Türkiye saati, doğru toplamlar', async () => {
      const { merchant, apiKey } = await createMerchant({ businessName: 'Kadıköy Simit Fırını', taxId: '1234567890' });
      const { merchant: other } = await createMerchant();
      await createTx(merchant, { ...HUNDRED, createdAt: new Date('2026-09-19T10:05:07.000Z'), gib: 'KALEM2026091900001' });
      await createTx(merchant, { total: '50000000', createdAt: new Date('2026-09-19T12:00:00.000Z') }); // dağılım verisi yok
      await createTx(merchant, { ...HUNDRED, createdAt: new Date('2026-09-18T10:00:00.000Z') }); // başka gün
      await createTx(other, { ...HUNDRED, createdAt: new Date('2026-09-19T11:00:00.000Z') }); // başka esnaf

      const { res, text, bytes } = await csvFor(apiKey, merchant, '2026-09-19');
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /^text\/csv; charset=utf-8/);
      assert.match(res.headers.get('content-disposition'), /attachment; filename="kalem-gun-sonu-2026-09-19\.csv"/);
      assert.equal(res.headers.get('cache-control'), 'no-store');

      assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'Excel için UTF-8 BOM (ham baytlar)');
      const lines = text.replace(/^﻿/, '').split('\r\n').filter((l) => l !== '');

      assert.equal(lines[0], 'KALEM Gün Sonu Raporu');
      assert.ok(!text.includes('SİMÜLASYON'), 'rapor simülasyon damgası taşımaz');

      assert.ok(lines.includes('İşletme;Kadıköy Simit Fırını'));
      assert.ok(lines.includes('VKN;1234567890'));
      assert.ok(lines.includes('Tarih;2026-09-19 (Türkiye saati)'));

      const headerIdx = lines.findIndex((l) => l.startsWith('Belge No;Saat;'));
      assert.ok(headerIdx > 0);
      const rows = lines.slice(headerIdx + 1, headerIdx + 3).map((l) => l.split(';'));
      const totalRow = lines.find((l) => l.startsWith('TOPLAM;')).split(';');

      // Yalnızca o günün ve o esnafın 2 işlemi (eskiden yeniye)
      assert.equal(rows.length, 2);
      // 1. işlem: 10:05:07Z = 13:05:07 TR; 100 TL; matrah 83,33; KDV 16,67; SF 0,10; hizmet 0,30; komisyon 0,40; net 99,60
      assert.deepEqual(rows[0].slice(0, 9), [
        'KALEM2026091900001', '13:05:07', '100,00', '83,33', '16,67', '0,10', '0,30', '0,40', '99,60',
      ]);
      // 2. işlem: dağılım verisi YOK → "veri yok" (uydurma yok); 5 TL; matrah 4,17; KDV 0,83
      assert.deepEqual(rows[1].slice(0, 9), [
        'veri yok', '15:00:00', '5,00', '4,17', '0,83', 'veri yok', 'veri yok', 'veri yok', 'veri yok',
      ]);

      // TOPLAM: brüt/matrah/KDV iki işlemi de kapsar; komisyon/net yalnızca dağılımlı işlemi
      assert.equal(totalRow[1], '2 işlem');
      assert.equal(totalRow[2], '105,00');
      assert.equal(totalRow[3], '87,50'); // 83,33 + 4,17
      assert.equal(totalRow[4], '17,50'); // 16,67 + 0,83
      assert.equal(totalRow[5], '0,10');
      assert.equal(totalRow[6], '0,30');
      assert.equal(totalRow[7], '0,40');
      assert.equal(totalRow[8], '99,60');
      assert.ok(lines.some((l) => /1 işlemde komisyon\/net verisi yok/.test(l)), 'eksik veri notu');
    });

    it('DÜZELTME KANITI: eski (10.000.000× şişkin) GİB belgesi olsa bile CSV tutarı Transaction.totalAmount\'tan gelir', async () => {
      const { merchant, apiKey } = await createMerchant();
      const tx = await createTx(merchant, { ...HUNDRED, createdAt: new Date('2026-09-19T10:00:00.000Z') });
      // 19 Eylül düzeltmesinden ÖNCE üretilmiş bir belge: 100 TL için "1000000000 TL" yazıyor
      const badDoc = await GibDocument.create({
        transactionId: tx._id,
        txHash: tx.txHash,
        ublContent: { Invoice: { ID: 'KALEM-ESKI-1', LegalMonetaryTotal: { PayableAmount: '1000000000.00' } } },
        totalAmountTL: '1000000000',
      });
      tx.gibDocumentId = badDoc._id;
      await tx.save();

      const { text } = await csvFor(apiKey, merchant, '2026-09-19');
      assert.ok(text.includes('KALEM-ESKI-1;13:00:00;100,00;83,33;16,67'), 'tutar 100,00 olmalı, 1.000.000.000 değil');
      assert.ok(!text.includes('1000000000'));
    });

    it('formül enjeksiyonu: işletme adı = ile başlıyorsa hücre etkisizleştirilir', async () => {
      const { merchant, apiKey } = await createMerchant({ businessName: '=HYPERLINK("http://kotu")', taxId: '+905551112233' });
      const { text } = await csvFor(apiKey, merchant, '2026-09-19');
      assert.ok(text.includes(`İşletme;"'=HYPERLINK(""http://kotu"")"`), text.split('\r\n')[3]);
      assert.ok(text.includes("VKN;'+905551112233"));
    });

    it('boş gün: yine geçerli CSV, TOPLAM sıfır', async () => {
      const { merchant, apiKey } = await createMerchant();
      const { res, text } = await csvFor(apiKey, merchant, '2026-01-01');
      assert.equal(res.status, 200);
      assert.ok(text.includes('TOPLAM;0 işlem;0,00'));
    });

    it('date verilmezse bugün (Türkiye saati); geçersiz tarih 400', async () => {
      const { merchant, apiKey } = await createMerchant();
      const res = await get(`/${merchant._id}/reports/daily`, apiKey);
      assert.match(res.headers.get('content-disposition'), new RegExp(`kalem-gun-sonu-${istanbulToday()}\\.csv`));
      assert.equal((await get(`/${merchant._id}/reports/daily?date=2026-02-31`, apiKey)).status, 400);
    });
  });

  describe('yardımcılar', () => {
    it('istanbulDayRange: UTC+3 sınırları ve geçersiz tarihler', () => {
      const r = istanbulDayRange('2026-09-19');
      assert.equal(r.from.toISOString(), '2026-09-18T21:00:00.000Z');
      assert.equal(r.to.toISOString(), '2026-09-19T21:00:00.000Z');
      for (const bad of ['2026-02-30', '2026-9-19', '', null, undefined, '2026-09-19T00:00']) {
        assert.equal(istanbulDayRange(bad), null, String(bad));
      }
    });

    it('istanbulToday: UTC 21:00 sonrası Türkiye\'de ertesi gün', () => {
      assert.equal(istanbulToday(new Date('2026-09-19T20:59:59Z')), '2026-09-19');
      assert.equal(istanbulToday(new Date('2026-09-19T21:00:00Z')), '2026-09-20');
    });

    it('csvText: ayraç/tırnak/satır sonu tırnaklanır; =,+,-,@ ile başlayanlar etkisizleştirilir', () => {
      assert.equal(csvText('a;b'), '"a;b"');
      assert.equal(csvText('a"b'), '"a""b"');
      assert.equal(csvText('=1+1'), "'=1+1");
      assert.equal(csvText('@x'), "'@x");
      assert.equal(csvText(null), '');
      assert.equal(csvText('düz'), 'düz');
    });
  });
});
