/**
 * `utils/net.js` — Özel/Loopback IP Tespiti Testleri
 *
 * Bu fonksiyon, `trust proxy` yanlış yapılandırmasını otomatik yakalamak için
 * kullanılır: rate limit anahtarı özel bir adrese çözülüyorsa, gerçek istemci
 * değil altyapının kendi iç adresi sayılıyor demektir ve limitler "IP başına"
 * değil fiilen "küresel" çalışır.
 *
 * Gerçek olay (10 Eylül 2026, Render): `TRUST_PROXY_HOPS=1` iken `req.ip`
 * `10.25.111.8` (Render iç yük dengeleyicisi) çözülüyordu.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateOrLoopbackIp } from '../src/utils/net.js';

describe('isPrivateOrLoopbackIp — özel/iç adresler', () => {
  it('Render iç ağ adreslerini (10.x) yakalamalı — gerçek olayın adresleri', () => {
    assert.equal(isPrivateOrLoopbackIp('10.25.111.8'), true);
    assert.equal(isPrivateOrLoopbackIp('10.24.213.77'), true);
  });

  it('diğer RFC1918 aralıklarını yakalamalı', () => {
    assert.equal(isPrivateOrLoopbackIp('192.168.1.1'), true);
    assert.equal(isPrivateOrLoopbackIp('172.16.0.1'), true);
    assert.equal(isPrivateOrLoopbackIp('172.31.255.254'), true);
  });

  it('172.16/12 aralığının SINIRLARINI doğru ayırmalı', () => {
    // 172.16-31 özeldir; 172.15 ve 172.32 DEĞİLDİR.
    assert.equal(isPrivateOrLoopbackIp('172.15.0.1'), false, '172.15 genel adrestir');
    assert.equal(isPrivateOrLoopbackIp('172.32.0.1'), false, '172.32 genel adrestir');
    // Cloudflare'in gerçek zincirde görülen adresi bu aralığın DIŞINDA olmalı:
    assert.equal(isPrivateOrLoopbackIp('172.71.151.201'), false);
  });

  it('loopback ve link-local adresleri yakalamalı', () => {
    assert.equal(isPrivateOrLoopbackIp('127.0.0.1'), true);
    assert.equal(isPrivateOrLoopbackIp('::1'), true);
    assert.equal(isPrivateOrLoopbackIp('169.254.1.1'), true);
    assert.equal(isPrivateOrLoopbackIp('fe80::1'), true);
    assert.equal(isPrivateOrLoopbackIp('fd00::1'), true);
  });

  it('IPv6 içine gömülü IPv4 biçimini çözmeli', () => {
    assert.equal(isPrivateOrLoopbackIp('::ffff:10.0.0.1'), true);
    assert.equal(isPrivateOrLoopbackIp('::ffff:88.253.38.157'), false);
  });

  it('genel (public) adresleri özel SAYMAMALI', () => {
    // Gerçek ölçümdeki istemci ve Cloudflare adresleri:
    assert.equal(isPrivateOrLoopbackIp('88.253.38.157'), false);
    assert.equal(isPrivateOrLoopbackIp('104.23.180.102'), false);
    assert.equal(isPrivateOrLoopbackIp('8.8.8.8'), false);
    assert.equal(isPrivateOrLoopbackIp('2001:4860:4860::8888'), false);
  });

  it('geçersiz/boş girdilerde false dönmeli, patlamamalı', () => {
    assert.equal(isPrivateOrLoopbackIp(''), false);
    assert.equal(isPrivateOrLoopbackIp(null), false);
    assert.equal(isPrivateOrLoopbackIp(undefined), false);
    assert.equal(isPrivateOrLoopbackIp('bu bir ip degil'), false);
    assert.equal(isPrivateOrLoopbackIp('10.0.0'), false, 'eksik oktet geçerli sayılmamalı');
    assert.equal(isPrivateOrLoopbackIp('10.0.0.999'), false, 'aralık dışı oktet');
  });
});
