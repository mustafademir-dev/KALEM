/**
 * Mutabakat (Reconciliation) Servisi Testleri
 *
 * Bu servis, 12 Eylül 2026'da canlı Render dağıtımında yaşanan GERÇEK bir
 * arızaya karşı yazıldı: ödeme zincire yazıldı, SSE dinleyicisi `started: true`
 * görünmesine rağmen hiç mesaj almadı (`messageCount: 0`, hata da yok) ve GİB
 * belgesi hiç üretilmedi. Aynı kod yerelde sorunsuz çalıştı — yani SSE tek
 * başına bir garanti değildir ve sistemin ondan bağımsız bir kurtarma yolu
 * olmalıdır (§6.4).
 *
 * Testler gerçek (bellek-içi) MongoDB kullanır; yalnızca Horizon ağ katmanı
 * mock'lanır — kod tabanının diğer testleriyle aynı kalıp.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import stellarConfig from '../src/config/stellar.js';
import Transaction from '../src/models/Transaction.model.js';
import GibDocument from '../src/models/GibDocument.model.js';
import { reconcilePendingTransactions } from '../src/services/reconciliation.service.js';
import { handleTransaction } from '../src/services/sse-listener.service.js';
import { flushFlowEvents } from '../src/services/flow-events.service.js';

/** Horizon'un tekil işlem sorgusunu taklit eden zincir kurucu. */
function mockHorizon(responder) {
  return {
    transactions: () => ({
      transaction: (hash) => ({ call: async () => responder(hash) }),
    }),
  };
}

/** Horizon 404'ü — işlem henüz ledger'da yok. */
function notFoundError() {
  const err = new Error('Not Found');
  err.response = { status: 404 };
  return err;
}

async function createSubmittedTx(txHash, { ageMs = 60_000 } = {}) {
  const doc = await Transaction.create({
    idempotencyKey: randomUUID(),
    senderAddress: StellarSdk.Keypair.random().publicKey(),
    merchantId: new mongoose.Types.ObjectId(),
    totalAmount: '25000000',
    status: 'submitted',
    txHash,
  });
  // `updatedAt`'i geriye alalım: servis çok taze işlemleri kasten atlar
  // (önce SSE'ye şans verir).
  await Transaction.collection.updateOne(
    { _id: doc._id },
    { $set: { updatedAt: new Date(Date.now() - ageMs) } }
  );
  return doc;
}

describe('Mutabakat Servisi — SSE yedeği', () => {
  let mongod;
  let originalHorizon;

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());
    originalHorizon = stellarConfig.horizonServer;
  });

  after(async () => {
    stellarConfig.horizonServer = originalHorizon;
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([Transaction.deleteMany({}), GibDocument.deleteMany({})]);
  });

  it('SSE kaçırdığında zincirde başarılı işlemi confirmed yapmalı ve GİB belgesi üretmeli', async () => {
    const txHash = 'a'.repeat(64);
    await createSubmittedTx(txHash);

    stellarConfig.horizonServer = mockHorizon(() => ({
      successful: true,
      ledger_attr: 4628674,
    }));

    const stats = await reconcilePendingTransactions();

    assert.equal(stats.confirmed, 1);
    const updated = await Transaction.findOne({ txHash });
    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.ledgerNumber, 4628674, 'ledger numarası yazılmalı');

    // Asıl kazanım: GİB belgesi SSE hiç çalışmasa da üretilmiş olmalı.
    const gib = await GibDocument.findOne({ txHash });
    assert.ok(gib, 'GİB belgesi üretilmeli');
    assert.ok(updated.gibDocumentId, 'işleme GİB belgesi bağlanmalı');
  });

  it('Horizon yanıtındaki `ledger` FONKSİYONUNU ledger numarası sanmamalı', async () => {
    // Regresyon: Horizon SDK yanıtında `tx.ledger` bir link takipçisi
    // fonksiyondur, sayı değildir. İlk implementasyonda `tx.ledger` önce
    // okunduğu için Mongoose "Cast to Number failed" ile patlıyordu ve
    // HİÇBİR işlem mutabakattan geçemiyordu.
    const txHash = 'b'.repeat(64);
    await createSubmittedTx(txHash);

    stellarConfig.horizonServer = mockHorizon(() => ({
      successful: true,
      ledger: async () => ({ sequence: 999 }), // fonksiyon — tuzak
      ledger_attr: 4242424,
    }));

    const stats = await reconcilePendingTransactions();

    assert.equal(stats.confirmed, 1, 'fonksiyon alanı kaydı bozmamalı');
    const updated = await Transaction.findOne({ txHash });
    assert.equal(updated.ledgerNumber, 4242424);
  });

  it('zincirde bulunamayan (404) işlemi submitted bırakmalı — sonraki turda tekrar denenir', async () => {
    const txHash = 'c'.repeat(64);
    await createSubmittedTx(txHash);

    stellarConfig.horizonServer = mockHorizon(() => {
      throw notFoundError();
    });

    const stats = await reconcilePendingTransactions();

    assert.equal(stats.pending, 1);
    assert.equal(stats.confirmed, 0);
    const updated = await Transaction.findOne({ txHash });
    assert.equal(updated.status, 'submitted', 'henüz onaylanmamış olabilir, kapatılmamalı');
  });

  it('zincirde BAŞARISIZ görünen işlemi failed yapmalı (sonsuz sorgulamayı önler)', async () => {
    const txHash = 'd'.repeat(64);
    await createSubmittedTx(txHash);

    stellarConfig.horizonServer = mockHorizon(() => ({ successful: false, ledger_attr: 123 }));

    const stats = await reconcilePendingTransactions();

    assert.equal(stats.failed, 1);
    const updated = await Transaction.findOne({ txHash });
    assert.equal(updated.status, 'failed');
    assert.ok(updated.errorMessage);
  });

  it('çok taze işlemleri atlamalı — önce SSE\'ye şans verir', async () => {
    const txHash = 'e'.repeat(64);
    await createSubmittedTx(txHash, { ageMs: 0 }); // henüz yeni

    let called = false;
    stellarConfig.horizonServer = mockHorizon(() => {
      called = true;
      return { successful: true, ledger_attr: 1 };
    });

    const stats = await reconcilePendingTransactions();

    assert.equal(stats.checked, 0, 'taze işlem için Horizon sorgusu yapılmamalı');
    assert.equal(called, false);
  });

  it('zaten confirmed olan işlemleri tekrar işlememeli', async () => {
    await Transaction.create({
      idempotencyKey: randomUUID(),
      senderAddress: StellarSdk.Keypair.random().publicKey(),
      merchantId: new mongoose.Types.ObjectId(),
      totalAmount: '1000',
      status: 'confirmed',
      txHash: 'f'.repeat(64),
    });

    let called = false;
    stellarConfig.horizonServer = mockHorizon(() => {
      called = true;
      return { successful: true, ledger_attr: 1 };
    });

    const stats = await reconcilePendingTransactions();
    assert.equal(stats.checked, 0);
    assert.equal(called, false);
  });

  it('canlı işlem akışı: onayı mutabakat yakalarsa 7. adım kaynağı "reconciliation" olmalı, 8. adım GİB belgesini göstermeli', async () => {
    const txHash = 'c'.repeat(64);
    const doc = await createSubmittedTx(txHash);
    stellarConfig.horizonServer = mockHorizon(() => ({ successful: true, ledger_attr: 4628674 }));

    await reconcilePendingTransactions();
    await flushFlowEvents();

    const updated = await Transaction.findById(doc._id).lean();
    const caught = updated.flowEvents.find((e) => e.step === 'caught');
    const gib = updated.flowEvents.find((e) => e.step === 'gib');
    assert.equal(caught.data.source, 'reconciliation');
    assert.equal(caught.data.ledger, 4628674);
    assert.equal(gib.status, 'done');
    assert.equal(gib.data.gibDocumentId, updated.gibDocumentId.toString());
    assert.equal(gib.data.simulated, true);

    // İkinci kez yakalanırsa (SSE + mutabakat yarışı) akışa tekrar yazılmamalı.
    await handleTransaction({ hash: txHash, ledger: 4628674 }, { source: 'sse' });
    await flushFlowEvents();
    const again = await Transaction.findById(doc._id).lean();
    assert.equal(again.flowEvents.filter((e) => e.step === 'caught').length, 1);
  });

  it('Horizon yapılandırılmamışsa çökmemeli, boş istatistik dönmeli', async () => {
    stellarConfig.horizonServer = null;
    const stats = await reconcilePendingTransactions();
    assert.deepEqual(stats, { checked: 0, confirmed: 0, failed: 0, pending: 0 });
  });
});
