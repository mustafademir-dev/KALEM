/**
 * `/api/v1/flow/*` Route Testleri — gerçek Express + gerçek HTTP soketi + bellek-içi MongoDB
 *
 * SSE yayını gerçek bir `fetch` akışı üzerinden okunur: panelin tarayıcıda
 * EventSource ile göreceği byte'ların aynısı.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import * as StellarSdk from '@stellar/stellar-sdk';

import config from '../src/config/index.js';
import Transaction from '../src/models/Transaction.model.js';
import flowRoutes from '../src/api/routes/flow.routes.js';
import { recordFlowEvent, flushFlowEvents, flowSubscriberCount } from '../src/services/flow-events.service.js';

const TOKEN = 'test-panel-token';

async function createTxWithEvent() {
  const tx = await Transaction.create({
    idempotencyKey: randomUUID(),
    senderAddress: StellarSdk.Keypair.random().publicKey(),
    merchantId: new mongoose.Types.ObjectId(),
    totalAmount: '25000000',
    status: 'submitted',
  });
  await recordFlowEvent(tx._id, 'signed', { data: { signer: tx.senderAddress } });
  return tx;
}

/** SSE akışından `event:` bloklarını okur; `count` olay gelince çözülür. */
async function readSseEvents(response, count, timeoutMs = 3000) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';
  const deadline = Date.now() + timeoutMs;

  while (events.length < count && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const eventLine = block.split('\n').find((l) => l.startsWith('event: '));
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      if (eventLine && dataLine) {
        events.push({ event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) });
      }
    }
  }
  return { events, reader };
}

describe('Canlı İşlem Akışı Route\'ları', () => {
  let mongod;
  let server;
  let baseUrl;
  const originalToken = config.flowPanel.token;

  before(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongod.getUri());
    const app = express();
    app.use('/api/v1/flow', flowRoutes);
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    config.flowPanel.token = originalToken;
    await flushFlowEvents();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    config.flowPanel.token = TOKEN;
    await Transaction.deleteMany({});
  });

  it('FLOW_PANEL_TOKEN tanımlı değilse 503 dönmeli (panel kapalı)', async () => {
    config.flowPanel.token = '';
    const res = await fetch(`${baseUrl}/api/v1/flow/latest?token=herhangi`);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'FLOW_PANEL_DISABLED');
  });

  it('yanlış ya da eksik token ile 401 dönmeli', async () => {
    const wrong = await fetch(`${baseUrl}/api/v1/flow/latest?token=yanlis`);
    assert.equal(wrong.status, 401);
    const missing = await fetch(`${baseUrl}/api/v1/flow/stream`);
    assert.equal(missing.status, 401);
    await missing.body?.cancel();
  });

  it('GET /latest: en yeni akışı döndürmeli; hiç akış yoksa flow:null', async () => {
    const empty = await fetch(`${baseUrl}/api/v1/flow/latest?token=${TOKEN}`);
    assert.deepEqual(await empty.json(), { flow: null });

    const tx = await createTxWithEvent();
    const res = await fetch(`${baseUrl}/api/v1/flow/latest?token=${TOKEN}`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.flow.transactionId, tx._id.toString());
    assert.equal(body.flow.events[0].step, 'signed');
  });

  it('GET /stream: önce anlık görüntü, sonra her yeni olayda güncel akışı yayınlamalı; kapanınca abonelik bırakılmalı', async () => {
    const tx = await createTxWithEvent();
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/v1/flow/stream?token=${TOKEN}`, { signal: controller.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);

    const first = await readSseEvents(res, 1);
    assert.equal(first.events[0].event, 'snapshot');
    assert.equal(first.events[0].data.flow.transactionId, tx._id.toString());

    await recordFlowEvent(tx._id, 'received', { data: { lock: 'acquired' } });

    // Aynı okuyucuyla devam et
    const decoder = new TextDecoder();
    let buffer = '';
    let flowEvent = null;
    const deadline = Date.now() + 3000;
    while (!flowEvent && Date.now() < deadline) {
      const { value, done } = await first.reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const match = buffer.match(/event: flow\ndata: (.*)\n\n/);
      if (match) flowEvent = JSON.parse(match[1]);
    }

    assert.ok(flowEvent, 'flow olayı yayınlanmalı');
    assert.deepEqual(
      flowEvent.flow.events.map((e) => e.step),
      ['signed', 'received']
    );

    assert.equal(flowSubscriberCount(), 1);
    controller.abort();
    for (let i = 0; i < 50 && flowSubscriberCount() > 0; i += 1) {
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(flowSubscriberCount(), 0, 'bağlantı kapanınca dinleyici temizlenmeli');
  });
});
