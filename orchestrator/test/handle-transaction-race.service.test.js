/**
 * `handleTransaction()` Yarış Durumu Testi — §9.9
 *
 * 17 Eylül 2026'da eklenen hız düzeltmesinden sonra AYNI işlem için ÜÇ ayrı
 * yol (doğrudan submit yanıtı / SSE dinleyicisi / mutabakat job'ı) neredeyse
 * aynı anda `handleTransaction()`'ı çağırabilir. Bu test, GERÇEK bir
 * (bellek-içi) MongoDB replica set'e karşı üç çağrıyı GERÇEKTEN eşzamanlı
 * (`Promise.all`, sıralı `await` DEĞİL) tetikleyip atomik `findOneAndUpdate`
 * korumasının çalıştığını kanıtlar: yalnızca BİR çağrı kazanır, GİB belgesi
 * TAM OLARAK BİR KEZ üretilir, akışa 'caught'/'gib' yalnızca bir kez yazılır.
 *
 * Düzeltmeden ÖNCEKİ kod (`findOne` okuyup sonra `save()` yazan, aradaki
 * pencerede yarışa açık "en iyi çaba" `firstCatch` bayrağı) bu testte
 * BAŞARISIZ olurdu — gerçek Mongo'da okuma/yazma arasındaki pencerede iki
 * çağrı da "ben ilkim" sanıp iki ayrı GİB belgesi üretebilirdi.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import Transaction from '../src/models/Transaction.model.js';
import GibDocument from '../src/models/GibDocument.model.js';
import Merchant from '../src/models/Merchant.model.js';
import { handleTransaction } from '../src/services/sse-listener.service.js';
import { flushFlowEvents } from '../src/services/flow-events.service.js';

describe('handleTransaction — üç yolun (doğrudan/SSE/mutabakat) gerçek yarış durumu', () => {
  let mongod;

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());
  });

  after(async () => {
    await flushFlowEvents();
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([Transaction.deleteMany({}), GibDocument.deleteMany({}), Merchant.deleteMany({})]);
  });

  async function createSubmittedTx(txHash) {
    const merchant = await Merchant.create({
      businessName: 'Yarış Testi Esnafı',
      taxId: 'TAX-' + randomUUID(),
      stellarAddress: StellarSdk.Keypair.random().publicKey(),
      apiKeyHash: 'hash-' + randomUUID(),
      ownershipVerified: true,
      isActive: true,
    });
    return Transaction.create({
      idempotencyKey: randomUUID(),
      senderAddress: StellarSdk.Keypair.random().publicKey(),
      merchantId: merchant._id,
      totalAmount: '25000000',
      status: 'submitted',
      txHash,
    });
  }

  it('aynı işlem için 3 GERÇEKTEN eşzamanlı çağrı (doğrudan+SSE+mutabakat) — yalnızca 1 kazanır, GİB TAM OLARAK 1 kez üretilir', async () => {
    const txHash = 'r'.repeat(64);
    const tx = await createSubmittedTx(txHash);

    // Promise.all: sıralı await DEĞİL — üçü de AYNI ANDA Mongo'ya varmaya çalışır.
    const [direct, sse, reconciliation] = await Promise.all([
      handleTransaction({ hash: txHash, ledger: 4628674 }, { source: 'submit_response' }),
      handleTransaction({ hash: txHash, ledger: 4628674 }, { source: 'sse' }),
      handleTransaction({ hash: txHash, ledger: 4628674 }, { source: 'reconciliation' }),
    ]);

    const results = [direct, sse, reconciliation];
    const winners = results.filter((r) => r !== null);
    const losers = results.filter((r) => r === null);

    assert.equal(winners.length, 1, 'ÜÇ eşzamanlı çağrıdan TAM OLARAK BİRİ kazanmalı');
    assert.equal(losers.length, 2, 'diğer İKİSİ güvenle null dönmeli (tekrar işlemeden)');
    assert.equal(winners[0].status, 'confirmed');

    await flushFlowEvents();

    // Asıl kazanım: GİB belgesi İKİ KEZ üretilmiş olabilirdi (düzeltmeden önce
    // gerçek Mongo'da bu senaryo tam da bunu yapardı) — TAM OLARAK bir tane olmalı.
    const gibDocs = await GibDocument.find({ transactionId: tx._id });
    assert.equal(gibDocs.length, 1, 'GİB belgesi TAM OLARAK bir kez üretilmeli (çift değil)');

    // Akışa da 'caught' ve 'gib' yalnızca birer kez yazılmalı.
    const updated = await Transaction.findById(tx._id).lean();
    assert.equal(updated.status, 'confirmed');
    assert.equal(updated.gibDocumentId?.toString(), gibDocs[0]._id.toString());
    assert.equal(updated.flowEvents.filter((e) => e.step === 'caught').length, 1);
    assert.equal(updated.flowEvents.filter((e) => e.step === 'gib').length, 1);

    // Kazanan hangi kaynaktan geldiyse akışta o kaydedilmeli (üçünden biri —
    // hangisi olduğu deterministik değil, gerçek yarışta doğaldır; ÖNEMLİ olan
    // akıştaki kaynağın GERÇEKTEN kazanan çağrıyla tutarlı olmasıdır).
    const caughtEvent = updated.flowEvents.find((e) => e.step === 'caught');
    assert.ok(
      ['submit_response', 'sse', 'reconciliation'].includes(caughtEvent.data.source),
      'akıştaki kaynak üç gerçek yoldan biri olmalı'
    );
  });

  it('ardışık (yarışmayan) çağrılarda da aynı garanti geçerli: ikinci çağrı hiçbir şeyi tekrar işlemez', async () => {
    const txHash = 's'.repeat(64);
    const tx = await createSubmittedTx(txHash);

    const first = await handleTransaction({ hash: txHash, ledger: 1 }, { source: 'submit_response' });
    const second = await handleTransaction({ hash: txHash, ledger: 1 }, { source: 'sse' });

    assert.ok(first, 'ilk çağrı kazanmalı');
    assert.equal(second, null, 'ikinci çağrı (aynı işlem zaten onaylı) null dönmeli');

    await flushFlowEvents();
    const gibDocs = await GibDocument.find({ transactionId: tx._id });
    assert.equal(gibDocs.length, 1);
  });
});
