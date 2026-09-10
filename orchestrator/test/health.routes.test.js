/**
 * Sağlık Kontrolü Route Testleri
 *
 * İki ucun **farklı sözleşmeleri** olduğunu doğrular:
 * - `/health` (liveness): bağımlılıklar bozuk olsa BİLE 200 döner. Bu kasıtlıdır —
 *   Render'ın `healthCheckPath`'i burayı çağırır ve 503 dönseydi geçici bir
 *   MongoDB kesintisi yeniden başlatma döngüsü tetiklerdi.
 * - `/health/ready` (readiness): bağımlılık bozuksa 503 döner.
 *
 * Ayrıca SSE durum raporlamasının doğruluğu test edilir: ücretsiz bulut planında
 * servis uyuyup uyandığında HTTP cevap verse de SSE akışı ölü kalabilir; bu uç
 * o sessiz arızayı görünür kılmak için var (§6.4).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';

import healthRoutes from '../src/api/routes/health.routes.js';
import * as sseListener from '../src/services/sse-listener.service.js';

describe('GET /api/v1/health — liveness ve readiness', () => {
  let server;
  let baseUrl;
  let originalGetSSEStatus;

  before(async () => {
    const app = express();
    app.use('/api/v1/health', healthRoutes);
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/health`;
    originalGetSSEStatus = sseListener.getSSEStatus;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('liveness: MongoDB bağlı DEĞİLKEN bile 200 dönmeli (Render restart döngüsü olmasın)', async () => {
    // Bu test paketinde mongoose bağlantısı yok — readyState 0 (disconnected).
    assert.notEqual(mongoose.connection.readyState, 1, 'ön koşul: bağlantı olmamalı');

    const res = await fetch(baseUrl);
    assert.equal(res.status, 200, 'liveness bağımlılıktan bağımsız 200 olmalı');

    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'kalem-orchestrator');
    assert.equal(body.dependencies.mongodb, 'disconnected', 'gerçek durumu dürüstçe raporlamalı');
  });

  it('readiness: MongoDB bağlı değilken 503 dönmeli', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    assert.equal(res.status, 503);

    const body = await res.json();
    assert.equal(body.status, 'not_ready');
  });

  it('SSE dinleyicisinin durumunu raporlamalı', async () => {
    const res = await fetch(baseUrl);
    const body = await res.json();

    const sse = body.dependencies.stellar.sseListener;
    assert.ok(sse, 'sseListener alanı bulunmalı');
    assert.equal(typeof sse.started, 'boolean');
    assert.equal(typeof sse.messageCount, 'number');
    assert.equal(typeof sse.stale, 'boolean');
  });

  it('trust proxy ayarını raporlamalı (deploy sonrası gözle doğrulama için)', async () => {
    const res = await fetch(baseUrl);
    const body = await res.json();
    assert.equal(typeof body.trustProxyHops, 'number');
  });

  it('proxy teşhis bloğunu raporlamalı (zincirin gerçek şekli görülebilsin)', async () => {
    const res = await fetch(baseUrl);
    const body = await res.json();

    assert.ok(body.proxy, 'proxy bloğu bulunmalı');
    assert.equal(typeof body.proxy.trustProxyHops, 'number');
    assert.ok(Array.isArray(body.proxy.forwardedChain));
    assert.equal(typeof body.proxy.looksMisconfigured, 'boolean');
    // Bu testte istek loopback'ten geliyor; XFF yok, trust proxy kapalı →
    // req.ip = 127.0.0.1 → tespit doğru şekilde "yanlış yapılandırma" demeli.
    assert.equal(body.proxy.looksMisconfigured, true, 'loopback adres tespit edilmeli');
    assert.ok(body.proxy.hint, 'yanlış yapılandırmada yol gösterici mesaj olmalı');
  });

  it('trust proxy = 3 GERÇEK Render zincirinde gerçek istemciyi seçmeli', async () => {
    // 10 Eylül 2026'da canlı Render'dan ÖLÇÜLEN zincir şekli birebir kullanılır:
    //   <gerçek istemci>, <Cloudflare>, <Render iç ağı>
    // Express SOKET bağlantısını da bir hop sayar (Render'da ::1 üzerinden gelir):
    //   hop0=::1, hop1=Render-iç, hop2=Cloudflare, hop3=GERÇEK İSTEMCİ
    // Bu yüzden doğru değer 3'tür (2 değil — 2, Cloudflare'i seçerdi).
    const app = express();
    app.set('trust proxy', 3);
    app.use('/api/v1/health', healthRoutes);
    const srv = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/v1/health`, {
        headers: { 'X-Forwarded-For': '88.253.38.157, 104.23.180.102, 10.25.111.8' },
      });
      const body = await res.json();

      assert.equal(body.proxy.resolvedClientIp, '88.253.38.157', 'gerçek istemci seçilmeli');
      assert.equal(body.proxy.looksMisconfigured, false);
      assert.equal(body.proxy.hint, null);
    } finally {
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  it('trust proxy = 1 (ESKİ HATALI değer) Render iç adresini seçmeli — regresyon koruması', async () => {
    // Bu test, hatanın kendisini dondurur: 1 ile aynı zincir Render'ın İÇ
    // adresine çözülür ve o adres tüm kullanıcılarda ortak olduğu için limitler
    // "IP başına" değil KÜRESEL sayar. Biri TRUST_PROXY_HOPS'u 1'e geri alırsa
    // bu test neyin bozulduğunu açıkça gösterir.
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/v1/health', healthRoutes);
    const srv = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/v1/health`, {
        headers: { 'X-Forwarded-For': '88.253.38.157, 104.23.180.102, 10.25.111.8' },
      });
      const body = await res.json();

      assert.equal(body.proxy.resolvedClientIp, '10.25.111.8', 'hatalı değer iç adresi seçer');
      assert.equal(body.proxy.looksMisconfigured, true, 'tespit bu hatayı yakalamalı');
    } finally {
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  it('saldırgan XFF enjekte etse bile trust proxy = 3 gerçek istemciyi seçmeli', async () => {
    // Altyapı zincire EKLER (ezmez) — ölçümle doğrulandı. Saldırganın uydurduğu
    // girdiler zincirin SOLUNA düşer, güvenilen hop konumunu etkileyemez.
    const app = express();
    app.set('trust proxy', 3);
    app.use('/api/v1/health', healthRoutes);
    const srv = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    try {
      const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/v1/health`, {
        headers: {
          'X-Forwarded-For': '1.2.3.4, 9.9.9.9, 88.253.38.157, 104.23.180.102, 10.25.111.8',
        },
      });
      const body = await res.json();

      assert.equal(body.proxy.resolvedClientIp, '88.253.38.157', 'sahte girdiler seçilmemeli');
      assert.notEqual(body.proxy.resolvedClientIp, '1.2.3.4');
    } finally {
      await new Promise((resolve) => srv.close(resolve));
    }
  });

  it('Horizon/Soroban adreslerini raporlamalı ama canlı ağ çağrısı YAPMAMALI', async () => {
    // Bu uç dakikada bir çağrılabilir (uyanık tutma ping'i); her çağrıda dış ağa
    // gitmek gereksiz yük ve ek başarısızlık kaynağı olurdu.
    const t0 = Date.now();
    const res = await fetch(baseUrl);
    const elapsed = Date.now() - t0;
    const body = await res.json();

    assert.ok(body.dependencies.stellar.horizonUrl.startsWith('http'));
    assert.ok(body.dependencies.stellar.sorobanRpcUrl.startsWith('http'));
    assert.ok(elapsed < 1000, `dış ağ çağrısı yapmamalı, hızlı dönmeli (${elapsed}ms)`);
  });

  it('uptime ve zaman damgası taşımalı', async () => {
    const res = await fetch(baseUrl);
    const body = await res.json();
    assert.equal(typeof body.uptimeSeconds, 'number');
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)), 'timestamp ayrıştırılabilir olmalı');
  });
});

describe('SSE dinleyici durum takibi (getSSEStatus)', () => {
  it('başlatılmamışken started:false ve sayaç 0 olmalı', () => {
    const status = sseListener.getSSEStatus();
    assert.equal(status.started, false);
    assert.equal(status.messageCount, 0);
    assert.equal(status.lastMessageAt, null);
  });

  it('durum nesnesinin KOPYASINI dönmeli — dışarıdan mutasyon iç duruma sızmamalı', () => {
    const first = sseListener.getSSEStatus();
    first.messageCount = 9999;
    first.started = true;

    const second = sseListener.getSSEStatus();
    assert.equal(second.messageCount, 0, 'iç durum dışarıdan değiştirilememeli');
    assert.equal(second.started, false);
  });
});
