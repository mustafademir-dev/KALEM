/**
 * Müşterinin kendi iadeleri (POST /customers/refunds) — imzalı sahiplik kanıtı.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import Transaction from '../src/models/Transaction.model.js';
import GibDocument from '../src/models/GibDocument.model.js';
import Customer from '../src/models/Customer.model.js';
import Merchant from '../src/models/Merchant.model.js';
import { buildCustomerRefundsChallenge, buildCustomerReceiptsChallenge } from '../src/utils/crypto.js';
import { listCustomerRefundsHandler, listCustomerReceiptsHandler } from '../src/api/routes/customer.routes.js';

async function paidTx(sender, { refunded = false, documentNo = null } = {}) {
  const tx = await Transaction.create({
    idempotencyKey: randomUUID(),
    senderAddress: sender,
    merchantId: new mongoose.Types.ObjectId(),
    totalAmount: '5000000000',
    status: 'confirmed',
    txHash: randomUUID().replace(/-/g, ''),
    ...(refunded ? { refund: { status: 'completed', completedAt: new Date() } } : {}),
  });
  if (documentNo) {
    const doc = await GibDocument.create({ transactionId: tx._id, txHash: tx.txHash, ublContent: { Invoice: { ID: documentNo } } });
    tx.gibDocumentId = doc._id;
    await tx.save();
  }
  return tx;
}

function signedBody(kp, { timestamp = Date.now(), wrongKey = false, challenge = buildCustomerRefundsChallenge } = {}) {
  const signer = wrongKey ? StellarSdk.Keypair.random() : kp;
  const signature = signer.sign(Buffer.from(challenge(kp.publicKey(), timestamp), 'utf8')).toString('base64');
  return { address: kp.publicKey(), timestamp, signature };
}

describe('Müşteri iadeleri ucu', () => {
  let mongod, server, baseUrl;
  const post = (body) =>
    fetch(`${baseUrl}/api/v1/customers/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());
    const app = express();
    app.use(express.json());
    app.post('/api/v1/customers/refunds', listCustomerRefundsHandler);
    app.post('/api/v1/customers/receipts', listCustomerReceiptsHandler);
    await new Promise((r) => { server = app.listen(0, r); });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    await new Promise((r) => server.close(r));
    await mongoose.disconnect();
    await mongod.stop();
  });
  beforeEach(async () => {
    await Promise.all([Transaction.deleteMany({}), GibDocument.deleteMany({}), Customer.deleteMany({}), Merchant.deleteMany({})]);
  });

  it('yalnızca kendi iade EDİLMİŞ ödemelerini, fiş numarasıyla döner', async () => {
    const me = StellarSdk.Keypair.random();
    const refunded = await paidTx(me.publicKey(), { refunded: true, documentNo: 'KALEM-R1' });
    await paidTx(me.publicKey()); // iade edilmemiş
    await paidTx(StellarSdk.Keypair.random().publicKey(), { refunded: true }); // başkasının

    const res = await post(signedBody(me));
    assert.equal(res.status, 200);
    const { refunds } = await res.json();
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].txHash, refunded.txHash);
    assert.equal(refunds[0].documentNo, 'KALEM-R1');
    assert.equal(refunds[0].amount, '5000000000');
  });

  it('adresin sahibi olmayan imza reddedilir; eski zaman damgası reddedilir', async () => {
    const me = StellarSdk.Keypair.random();
    assert.equal((await post(signedBody(me, { wrongKey: true }))).status, 403);
    assert.equal((await post(signedBody(me, { timestamp: Date.now() - 10 * 60 * 1000 }))).status, 400);
    assert.equal((await post({ address: 'bozuk', timestamp: Date.now(), signature: 'x' })).status, 400);
  });

  it('fiş geçmişi: önceki cihazın ödemeleri de gelir, işletme adı ve iade bilgisiyle', async () => {
    const oldKp = StellarSdk.Keypair.random();
    const newKp = StellarSdk.Keypair.random();
    await Customer.create({ tcHash: 'h', pinHash: 'p', stellarAddress: newKp.publicKey(), addressHistory: [oldKp.publicKey()] });
    const m = await Merchant.create({
      businessName: 'Demo Kırtasiye', taxId: 'T1', stellarAddress: StellarSdk.Keypair.random().publicKey(),
      apiKeyHash: 'x' + randomUUID(), ownershipVerified: true,
    });
    const oldTx = await paidTx(oldKp.publicKey(), { refunded: true });
    await Transaction.updateOne({ _id: oldTx._id }, { $set: { merchantId: m._id } });
    await paidTx(newKp.publicKey());
    await paidTx(StellarSdk.Keypair.random().publicKey()); // başkasının

    const res = await fetch(`${baseUrl}/api/v1/customers/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedBody(newKp, { challenge: buildCustomerReceiptsChallenge })),
    });
    assert.equal(res.status, 200);
    const { receipts } = await res.json();
    assert.equal(receipts.length, 2);
    const old = receipts.find((r) => r.txHash === oldTx.txHash);
    assert.equal(old.businessName, 'Demo Kırtasiye');
    assert.equal(old.senderAddress, oldKp.publicKey());
    assert.ok(old.refundedAt);
  });

  it('fiş geçmişi: iade imza mesajıyla (başka amaçla imzalanmış) istek reddedilir', async () => {
    const kp = StellarSdk.Keypair.random();
    const res = await fetch(`${baseUrl}/api/v1/customers/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedBody(kp)),
    });
    assert.equal(res.status, 403);
  });
});
