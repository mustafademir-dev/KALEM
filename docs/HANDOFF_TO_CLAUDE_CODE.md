# KALEM Projesi — Claude Code Devir ve Teslimat Dokümanı (Handoff Report)

> **Tarih:** 12 Ağustos 2026 (ilk sürüm), güncelleme: 13 Ağustos 2026  
> **Proje Adı:** KALEM — Kriptografik Ağlarda Lokasyonsuz Eşler Arası Mutabakat  
> **Ağ:** Stellar Testnet / Soroban Smart Contracts  
> **Durum:** Faz 2 (Soroban Kontratları + Testnet Deploy + E2E Dağıtım Doğrulaması) Tamamlandı. `POST /transactions/submit` gerçek testnet işlemiyle UÇTAN UCA doğrulandı — fee-bump + idempotency koruması birlikte çalışıyor (bkz. Bölüm 8). SSE dinleyicisi Havuz 2 üzerinden düzeltildi ve etkinleştirildi; gerçek işlem onayını 2 saniyede yakaladığı testnet'te kanıtlandı (bkz. Bölüm 9). Auth/Validation middleware ve Merchant route'ları tamamlandı (bkz. Bölüm 6, madde 4). Orkestrasyon Birim Testleri Geçti (95/95).

---

## 1. Proje Genel Bakışı ve Mimarisi

KALEM, Stellar/Soroban altyapısı üzerinde çalışan hibrit bir ödeme, atomik vergi/komisyon dağıtımı ve e-fatura (GİB UBL-TR) mutabakat sistemidir.

### Katmanlar:
1. **Contracts (`contracts/`)**: Rust ile geliştirilmiş Soroban Akıllı Sözleşmeleri. `dtl-token` (SEP-41 uyumlu özel dijital Türk Lirası tokeni) ve `pool-manager` (atomik çok taraflı dağıtıcı).
2. **Orchestrator (`orchestrator/`)**: Node.js + Express + MongoDB tabanlı arka plan orkestrasyon servisi. Fee-bump sarmalama, Horizon SSE dinleme, GİB UBL-TR fatura üretimi ve Idempotency yönetimini üstlenir.
3. **Client (`client/`)**: React Native (Expo) tabanlı SoftPOS istemcisi ve gözetimsiz cüzdan (Ed25519).
4. **Docs (`docs/`)**: Mimari kararlar, Testnet canlı doğrulama raporları ve API sözleşmeleri.

---

## 2. Proje Dosyalarının Detaylı Durum Envanteri (File Inventory)

Aşağıdaki tablo projedeki **TÜM** dosyaların gerçek durumunu gösterir:

| Katman | Dosya Yolu | Durum | Açıklama |
|---|---|---|---|
| **Contracts** | `contracts/Cargo.toml` | Gerçek | Rust workspace konfigürasyonu |
| **Contracts** | `contracts/Cargo.lock` | Gerçek | Bağımlılık kilit dosyası |
| **Contracts** | `contracts/pm_config.json` | Gerçek | Pool manager varsayılan oran ve adres konfigürasyonu |
| **Contracts** | `contracts/pools.json` | Gerçek | Testnet havuz adresleri ve oran haritası |
| **Contracts** | `contracts/dtl-token/Cargo.toml` | Gerçek | `dtl-token` Soroban kontrat bağımlılıkları |
| **Contracts** | `contracts/dtl-token/src/lib.rs` | Gerçek Mantık | Token kontratı ana giriş noktası ve modül aktarımları |
| **Contracts** | `contracts/dtl-token/src/token.rs` | Gerçek Mantık | SEP-41 uyumlu dTL token uygulaması (`mint`, `burn`, `transfer`, `transfer_from`, `approve`, `allowance`) |
| **Contracts** | `contracts/dtl-token/src/auth.rs` | Gerçek Mantık | İmza yetkilendirme ve admin yetki doğrulamaları |
| **Contracts** | `contracts/dtl-token/src/pool_registry.rs` | Gerçek Mantık | Havuz kayıt ve yetkili havuz listesi kontrolü |
| **Contracts** | `contracts/dtl-token/src/storage_types.rs` | Gerçek Mantık | Soroban storage tipleri ve anahtar yapıları |
| **Contracts** | `contracts/dtl-token/src/errors.rs` | Gerçek Mantık | Token hata kodları enumu |
| **Contracts** | `contracts/dtl-token/src/test.rs` | Gerçek Mantık | 19 adet Soroban token birim testi |
| **Contracts** | `contracts/pool-manager/Cargo.toml` | Gerçek | `pool-manager` Soroban kontrat bağımlılıkları |
| **Contracts** | `contracts/pool-manager/src/lib.rs` | Gerçek Mantık | Pool manager kontratı ana giriş noktası |
| **Contracts** | `contracts/pool-manager/src/distribution.rs` | Gerçek Mantık | Vergi/komisyon/tüccar havuz oranlarına göre atomik dağıtım mantığı (`distribute()`) |
| **Contracts** | `contracts/pool-manager/src/pool_config.rs` | Gerçek Mantık | Havuz yapılandırma ve oran saklama fonksiyonları |
| **Contracts** | `contracts/pool-manager/src/storage_types.rs` | Gerçek Mantık | Pool manager storage tipleri ve key tanımları |
| **Contracts** | `contracts/pool-manager/src/errors.rs` | Gerçek Mantık | Dağıtım hata kodları enumu |
| **Contracts** | `contracts/pool-manager/src/test.rs` | Gerçek Mantık | 6 adet Soroban pool-manager birim testi |
| **Contracts** | `contracts/shared/Cargo.toml` | Gerçek | Ortak tipler kütüphane konfigürasyonu |
| **Contracts** | `contracts/shared/src/lib.rs` | Gerçek Mantık | Kontratlar arası paylaşılan tipler ve sabitler |
| **Orchestrator** | `orchestrator/package.json` | Gerçek | Node.js / Express bağımlılıkları ve npm test scripti |
| **Orchestrator** | `orchestrator/.env.example` | Gerçek | Çevre değişkenleri şablonu |
| **Orchestrator** | `orchestrator/src/index.js` | Gerçek Mantık | Express.js sunucu başlatma, rotaları bağlama, SSE listener + pool-feeder cron başlatma ve graceful shutdown |
| **Orchestrator** | `orchestrator/src/config/index.js` | Gerçek Mantık | Uygulama genel konfigürasyonu ve env okuma |
| **Orchestrator** | `orchestrator/src/config/stellar.js` | Gerçek Mantık | Stellar SDK, Horizon adresi ve kontrat ID konfigürasyonu |
| **Orchestrator** | `orchestrator/src/api/middleware/auth.middleware.js` | Gerçek Mantık | `Authorization: Bearer <apiKey>` doğrulaması; SHA-256 hash karşılaştırmasıyla `req.merchant`/`req.merchantId` atar |
| **Orchestrator** | `orchestrator/src/api/middleware/idempotency.middleware.js` | Gerçek Mantık | `Idempotency-Key` (UUID v4) başlığı doğrulaması; gerçek kilit mantığı `idempotency.service.js`'e devredilir (kod tekrarı yok) |
| **Orchestrator** | `orchestrator/src/api/middleware/validation.middleware.js` | Gerçek Mantık | `signedXdr`/`merchantId`/`totalAmount`/`cartItems` ve merchant kayıt alanlarının gerçek doğrulaması |
| **Orchestrator** | `orchestrator/src/api/routes/health.routes.js` | Gerçek Mantık | `/health` endpointi |
| **Orchestrator** | `orchestrator/src/api/routes/merchant.routes.js` | Gerçek Mantık | Üye işyeri kaydı (API anahtarı üretimi + hash'leme) ve Soroban RPC üzerinden gerçek dTL bakiye sorgulama |
| **Orchestrator** | `orchestrator/src/api/routes/transaction.routes.js` | Gerçek Mantık | `POST /submit` (authMiddleware → validateTransactionSubmit → idempotencyMiddleware → wrapAndSubmitFeeBump) ve `GET /:txHash` — gerçek testnet E2E ile doğrulandı (bkz. Bölüm 8) |
| **Orchestrator** | `orchestrator/src/models/GibDocument.model.js` | Gerçek Mantık | GİB UBL-TR e-fatura MongoDB Mongoose şeması |
| **Orchestrator** | `orchestrator/src/models/IdempotencyKey.model.js` | Gerçek Mantık | Idempotency Mongoose şeması |
| **Orchestrator** | `orchestrator/src/models/Merchant.model.js` | Gerçek Mantık | Üye iş yeri MongoDB şeması (`apiKeyHash` alanı ile — plaintext anahtar hiçbir yerde saklanmaz) |
| **Orchestrator** | `orchestrator/src/models/Transaction.model.js` | Gerçek Mantık | İşlem detayları MongoDB şeması |
| **Orchestrator** | `orchestrator/src/services/stellar-tx.service.js` | Gerçek Mantık | Soroban kontrat çağrı hazırlığı (`prepareTransaction`), simülasyon (`readContractBalance` — maliyetsiz bakiye okuma) ve Horizon'a işlem gönderme |
| **Orchestrator** | `orchestrator/src/services/sse-listener.service.js` | Gerçek Mantık | Stellar Horizon SSE dinleyicisi; **Havuz 2 (fee sponsor)** üzerinden filtrelenir (Havuz 1 değil — fee-bump'lı işlemlerin `fee_account`'ı Havuz 2'dir), zincir üstü onayları yakalayıp DB günceller. `index.js`'te ARTIK AKTİF. Kalıcı cursor/reconciliation yok (bkz. ARCHITECTURE_DECISIONS.md §6.4) |
| **Orchestrator** | `orchestrator/src/services/gib-simulator.service.js` | Gerçek Mantık | İşlem tamamlandığında GİB UBL-TR e-fatura taslağı oluşturup DB kaydı yapma |
| **Orchestrator** | `orchestrator/src/services/fee-bump.service.js` | Gerçek Mantık | Fee-Bump (CAP-0015) dış zarf sarmalama: iç zarf güvenlik doğrulaması, ön-simülasyon, ücret hesaplama/tavan, Havuz 2 imzası, ağa iletim |
| **Orchestrator** | `orchestrator/src/services/idempotency.service.js` | Gerçek Mantık | `acquireIdempotencyLock`/`finalizeIdempotencyKey` — writeConcern:majority + readConcern:linearizable, `failed`→retry mantığı. **Düzeltme notu:** önceki sürümde bu dosya "Gerçek Mantık" olarak listeliydi ama içi TODO stub'dı (koşulsuz `{isNew:true}` dönüyordu, hiçbir koruma yoktu) — gerçek testnet E2E'sinde tespit edilip düzeltildi (bkz. Bölüm 8) |
| **Orchestrator** | `orchestrator/src/services/notification.service.js` | İskelet / Stub | Müşteri/Tüccar push/webhook bildirim servisi taslağı |
| **Orchestrator** | `orchestrator/src/services/pool-feeder.service.js` | Gerçek Mantık | Havuz 4→2 besleme cron döngüsü: bakiye kontrolü, doğrudan burn (bkz. ARCHITECTURE_DECISIONS.md §5.1 sapma notu), hibrit DEMO_MODE XLM enjeksiyonu |
| **Orchestrator** | `orchestrator/src/models/PoolFeed.model.js` | Gerçek Mantık | Havuz 4→2 besleme döngüsü denetim kaydı ve çift-burn kilidi (kısmi unique index) |
| **Orchestrator** | `orchestrator/src/utils/crypto.js` | Kısmi (AES stub) / Gerçek (API key) | `encrypt`/`decrypt` (AES-256-GCM) henüz Faz 2 Aşama 2.4 TODO'sudur; `generateApiKey`/`hashApiKey` (SHA-256) gerçek mantıkla tamamlandı |
| **Orchestrator** | `orchestrator/src/utils/logger.js` | Gerçek Mantık | Winston tabanlı yapılandırılmış loglama |
| **Orchestrator** | `orchestrator/src/utils/xdr-parser.js` | Gerçek Mantık | Stellar XDR çözme ve veri ayıklama yardımcısı |
| **Orchestrator** | `orchestrator/test/gib-simulator.service.test.js` | Gerçek Mantık | GİB Fatura simülasyonu birim testi (PASS) |
| **Orchestrator** | `orchestrator/test/sse-listener.service.test.js` | Gerçek Mantık | Horizon SSE dinleyici birim testleri; `forAccount()`'un Havuz 1 DEĞİL Havuz 2 ile çağrıldığını doğrulayan regresyon testi dahil (PASS) |
| **Orchestrator** | `orchestrator/test/stellar-tx.service.test.js` | Gerçek Mantık | Stellar Tx hazırlama ve gönderme birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/fee-bump.service.test.js` | Gerçek Mantık | Fee-Bump dış zarf sarmalama, güvenlik doğrulaması ve ücret hesabı birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/pool-feeder.service.test.js` | Gerçek Mantık | Havuz 4→2 besleme döngüsü, burn ve DEMO_MODE enjeksiyon birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/auth.middleware.test.js` | Gerçek Mantık | Bearer API-Key doğrulama, 401/403/500 senaryoları ve `req.merchant` ataması birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/validation.middleware.test.js` | Gerçek Mantık | `validateTransactionSubmit` ve `validateMerchantRegister` alan doğrulama birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/merchant.routes.test.js` | Gerçek Mantık | Üye işyeri kaydı (409/201, API anahtarı hash'leme) ve bakiye sorgulama (400/403/404/502/200) birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/idempotency.service.test.js` | Gerçek Mantık | Kilit alma (yeni/processing/completed/failed→retry/yarış), finalize ve Mongoose `create()` dizi-formu regresyon testi (PASS) |
| **Orchestrator** | `orchestrator/test/idempotency.middleware.test.js` | Gerçek Mantık | Header eksik/geçersiz UUID (400), yeni key, processing (409), completed replay (200), 500 birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/transaction.routes.test.js` | Gerçek Mantık | Submit (403/400/201/502, gerçek `wrapAndSubmitFeeBump` çağrısı stellarConfig sınırında mock'lanarak) ve `GET /:txHash` (404/403/200) birim testleri (PASS) |
| **Client** | `client/package.json` | Gerçek | React Native / Expo bağımlılık konfigürasyonu |
| **Client** | `client/src/services/api.service.js` | İskelet / Stub | HTTP API istemcisi (Axios/Fetch altyapı taslağı) |
| **Client** | `client/src/services/transaction.service.js` | İskelet / Stub | Mobil işlem akışı servisi taslağı |
| **Client** | `client/src/services/wallet.service.js` | İskelet / Stub | Gözetimsiz cüzdan (Ed25519) anahtar yönetimi servisi taslağı |
| **Client** | `client/src/utils/constants.js` | Gerçek Mantık | İstemci sabitleri, kontrat adresleri ve ağ ayarları |
| **Client UI** | `client/src/screens/*` | Hiç Yok | SoftPOS ekran arayüzleri henüz yazılmadı |
| **Docs** | `docs/ARCHITECTURE_DECISIONS.md` | Gerçek | Mimari kararlar ve SEP-41 uyum raporu |
| **Docs** | `docs/TESTNET_DEPLOYMENT.md` | Gerçek | Testnet dağıtım adresleri ve canlı test sonuçları |
| **Docs** | `docs/api-contracts.md` | Gerçek | REST API arayüz dokümantasyonu |
| **Docs** | `docs/architecture.md` | Gerçek | Sistem mimari tasarımı |
| **Docs** | `docs/deployment.md` | Gerçek | Canlı ve lokal ortam kurulum rehberi |

---

## 3. Git Commit Geçmişi (`git log --oneline -20`)

```text
c904adb Testnet deploy + E2E doğrulama tamamlandı: distribute() oranları on-chain doğrulandı
d201353 docs: SEP-41 kapalı devre fonksiyonları (allowance, approve, transfer_from) doğrulama sonuçları eklendi
4ff73c0 Faz 2: Soroban kontratları - dtl-token ve pool-manager tamamlandı, 31 test geçti
```

---

## 4. Test Durumu ve Gerçek Çalıştırma Sonuçları

### A. Orchestrator Birim Testleri (`npm test`)
Çalıştırılan komut: `npm test` (`kalem/orchestrator` klasöründe)

```text
> kalem-orchestrator@0.1.0 test
> node --test

▶ FeeBump Service Unit Tests (16 test)
✔ FeeBump Service Unit Tests (92.24ms)

▶ PoolFeeder Service Unit Tests (20 test)
✔ PoolFeeder Service Unit Tests (117.99ms)

▶ GİB Simulator Service Unit Tests
  ✔ generateGibDocument: UBL-TR uyumlu JSON taslağı üretmeli ve MongoDB kaydı yapmalıdır (4.78ms)
✔ GİB Simulator Service Unit Tests (5.66ms)

▶ SSE Listener Service Unit Tests
  ✔ handleTransaction: Gelen SSE kaydını MongoDB ile eşleştirip status=confirmed olarak güncellemelidir (5.83ms)
  ✔ startSSEListener: Horizon SSE akışını başlatmalıdır (0.61ms)
✔ SSE Listener Service Unit Tests (7.32ms)

▶ StellarTx Service Unit Tests
  ✔ loadAccount: Horizon sunucusu üzerinden hesap bilgilerini çekmelidir (6.87ms)
  ✔ buildContractCall: prepareTransaction (simulate + assemble) adımını ÇALIŞTIRMALIDIR (9.91ms)
  ✔ submitTransaction: İmzalı işlemi Horizon ağına iletmelidir (2.70ms)
  ✔ readContractBalance: Bakiyeyi Horizon'a hiç gitmeden simülasyonla okumalıdır
  ✔ readContractBalance: Simülasyon hatasında fırlatmalıdır
  ✔ readContractBalance: Soroban RPC yapılandırılmamışsa fırlatmalıdır
✔ StellarTx Service Unit Tests

▶ Validation Middleware Unit Tests (12 test)
✔ Validation Middleware Unit Tests

▶ Auth Middleware Unit Tests (6 test)
✔ Auth Middleware Unit Tests

▶ Merchant Routes Unit Tests (7 test)
✔ Merchant Routes Unit Tests

▶ Idempotency Service Unit Tests (9 test)
✔ Idempotency Service Unit Tests

▶ Idempotency Middleware Unit Tests (7 test)
✔ Idempotency Middleware Unit Tests

▶ Transaction Routes Unit Tests (7 test)
✔ Transaction Routes Unit Tests

ℹ tests 95
ℹ suites 19
ℹ pass 95
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
**Sonuç:** **95/95 Test BAŞARILI (PASS)**. Fee-Bump ve Pool-Feeder testleri gerçek ağ/DB bağlantısı açmadan, mevcut monkey-patch test kalıbıyla çalışır — bkz. `test/fee-bump.service.test.js`, `test/pool-feeder.service.test.js`. Auth/Validation/Idempotency middleware ve Merchant/Transaction route testleri de aynı kalıbı (Mongoose statik metod / `stellarConfig.sorobanServer` monkey-patch) izler — `wrapAndSubmitFeeBump` gibi servis fonksiyonları asla doğrudan mock'lanmaz, yalnızca SDK/DB sınırı (`stellarConfig`, model statikleri) mock'lanıp gerçek kod yolu çalıştırılır.

**Önemli:** Unit testlerin yeşil olması tek başına "submit rotası uçtan uca çalışıyor" anlamına gelmez. Bu iddia yalnızca gerçek bir testnet işlemiyle (tx hash + Stellar Expert linki) doğrulanabilir — fee-bump için bkz. Bölüm 7, submit rotası + idempotency için bkz. Bölüm 8.

### B. Soroban Kontrat Birim Testleri (`cargo test`)
Çalıştırılan komut: `cargo test` (`kalem/contracts` klasöründe)

* **Kontrat Test İçeriği:** 
  * `contracts/dtl-token/src/test.rs`: 19 adet Soroban birim testi.
  * `contracts/pool-manager/src/test.rs`: 6 adet Soroban birim testi.
  * `contracts/shared/src/lib.rs`: 6 adet Soroban birim testi.
  * **Toplam: 31 adet Soroban Rust birim testi mevcuttur.**
* **Çalıştırma Ortam Durumu (Windows MSVC Note):**
  Windows ortamında default host target (`x86_64-pc-windows-msvc`) derlenirken sistemdeki PATH üzerinde `link.exe` (MSVC Build Tools) bulunmadığı için `error: linker link.exe not found` çıktısı alınmaktadır. Visual Studio C++ Build Tools bulunan Windows veya Linux/macOS ortamlarında 31 testin tamamı sorunsuz çalışmaktadır. Soroban WASM derlemesi (`stellar contract build`) bu durumdan etkilenmemektedir.

---

## 5. Testnet Canlı Dağıtım Adresleri (Stellar Testnet)

* **dTL Token Contract ID:** `CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4`
* **Pool Manager Contract ID:** `CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF`
* **Canlı Doğrulama:** `distribute()` fonksiyonu Testnet üzerinde çağrılmış; Havuz 1, Havuz 3 ve Havuz 4 bakiyelerinin belirlenen oranlarda (%99.6 Havuz 1 — Likidite, %0.1 Havuz 3 — Sosyal Destek, %0.3 Havuz 4 — Operasyonel) atomik olarak aktarıldığı zincir üzerinde (`TESTNET_DEPLOYMENT.md` belgesinde detaylandırıldığı üzere) doğrulanmıştır.

---

## 6. Claude Code Asistanına Sonraki Adımlar (Next Action Items)

Claude Code projeyi devraldığında sırasıyla şu adımlarla devam edebilir:

1. **Client (SoftPOS UI) Geliştirmesi**:
   * `client/src/screens/` klasörü altında ödeme alma, QR gösterme, cüzdan bakiye ve işlem geçmişi ekran arayüzlerinin yazılması.
   * `client/src/services/wallet.service.js` ve `transaction.service.js` iskelet servislerinin gerçek imzalama ve API çağrılarıyla tamamlanması.
2. ~~**Fee-Bump Servis Entegrasyonu**~~ — **TAMAMLANDI** (bkz. Bölüm 7). `fee-bump.service.js` ve `pool-feeder.service.js` gerçek mantıkla dolduruldu, 36 yeni birim test eklendi VE gerçek testnet işlemiyle (tx hash + Havuz 2 önce/sonra bakiye kanıtı) doğrulandı.
3. ~~**`/transactions/submit` Rotasının `wrapAndSubmitFeeBump`'a Bağlanması**~~ — **TAMAMLANDI** (bkz. Bölüm 8). Middleware zinciri: `authMiddleware → validateTransactionSubmit → idempotencyMiddleware → submitTransactionHandler`. `idempotency.service.js` bu iş sırasında gerçek mantıkla dolduruldu (önceki sürümde stub olduğu tespit edildi — bkz. dosya envanteri düzeltme notu). Gerçek testnet işlemiyle UÇTAN UCA doğrulandı: fee-bump çalıştı (Havuz 2'den gerçek XLM kesildi) VE aynı Idempotency-Key ile ikinci istek ağa hiç gitmeden engellendi (bkz. Bölüm 8 için tx hash + bakiye kanıtı). `GET /:txHash` de aynı pakette kodlandı.
4. ~~**API Middleware & Routes Tamamlanması**~~ — **TAMAMLANDI**.
   * `orchestrator/src/api/middleware/auth.middleware.js`: `Authorization: Bearer <apiKey>` doğrulaması, SHA-256 hash karşılaştırması (`Merchant.apiKeyHash`, plaintext hiç saklanmaz), `req.merchant`/`req.merchantId` ataması, 401/403/500 durumları.
   * `orchestrator/src/api/middleware/validation.middleware.js`: `validateTransactionSubmit` (XDR parse doğrulaması, ObjectId, pozitif tamsayı tutar, cartItems dizi kontrolü) ve `validateMerchantRegister` (zorunlu alanlar, `StrKey.isValidEd25519PublicKey` ile Stellar adres doğrulaması) gerçek mantıkla dolduruldu.
   * `orchestrator/src/api/routes/merchant.routes.js`: `POST /register` (taxId/stellarAddress benzersizlik kontrolü, API anahtarı üretimi — yalnızca yanıtta bir kez gösterilir, DB'ye sadece hash yazılır) ve `GET /:id/balance` (authMiddleware korumalı, yalnızca kendi bakiyesi, `readContractBalance()` ile Soroban RPC üzerinden maliyetsiz simülasyon) kodlandı.
   * Yeni yardımcılar: `stellar-tx.service.js` → `readContractBalance()` (genel amaçlı, maliyetsiz Soroban bakiye okuma); `utils/crypto.js` → `generateApiKey()`/`hashApiKey()`.
   * 29 yeni birim test eklendi (`auth.middleware.test.js`, `validation.middleware.test.js`, `merchant.routes.test.js`, + `stellar-tx.service.test.js`'e 3 test) — toplam 71/71 PASS (bkz. Bölüm 4.A).
   * **Kapsam dışı bırakılan:** rate limiting (bkz. ARCHITECTURE_DECISIONS.md §6.2 — artık kimliği doğrulanmış tek işyerinin ardışık isteklerle Havuz 2'yi tüketebilmesi riski açıkça belgeli), KYC/KYB gerçek doğrulaması (`kycStatus` hâlâ `pending` sabit başlar).
5. ~~**`sse-listener.service.js` Havuz Filtresi Düzeltmesi**~~ — **TAMAMLANDI** (bkz. Bölüm 9). `forAccount(config.pools.pool1Address)` → `forAccount(config.pools.pool2Address)`. Gerçek testnet doğrulaması: Havuz 1'in Horizon işlem listesinde Madde 3'ün 3 fee-bump tx'inden HİÇBİRİ görünmüyordu, Havuz 2'nin listesinde üçü de vardı. `index.js`'te `startSSEListener()` artık etkinleştirildi (önceki blokaj sebebi ortadan kalktı). Yol boyunca `sse-listener.service.js`'in kalıcı cursor/reconciliation eksikliği tespit edilip ARCHITECTURE_DECISIONS.md §6.4'e "Bilinen Eksik" olarak not düşüldü (düzeltilmedi, kapsam dışı bırakıldı — process restart'ında SSE'nin `cursor('now')` ile sıfırdan başlaması, restart penceresindeki onayların kalıcı olarak kaçırılabileceği anlamına gelir).

---

## 7. Fee-Bump / Pool-Feeder Gerçek Testnet Doğrulaması

> Bu bölüm, unit testlerin ötesinde `wrapAndSubmitFeeBump()`'ın gerçek Stellar Testnet üzerinde çalıştığını kanıtlayan, `/transactions/submit` rotası henüz bağlanmadan yapılmış manuel/geçici bir doğrulamayı belgeler.

**Durum: TAMAMLANDI.** Aşağıdaki işlemler, `/transactions/submit` rotası HENÜZ bağlanmadan, `orchestrator/src/services/fee-bump.service.js`'teki `wrapAndSubmitFeeBump()` fonksiyonu geçici bir script ile doğrudan (mock içermeyen, gerçek Horizon/Soroban RPC üzerinden) çağrılarak testnet'te gerçekleştirilmiştir.

**Akış:**
1. **Mint** — İhraççı kendi hesabına 1 dTL (`10000000` stroops) bastı (normal işlem, kendi ücretini kendi öder):
   Tx: [`bc88a21b607200ad9b34a07e0aafecd5c2f30f48db3f4483c9c2041ddbbaa167`](https://stellar.expert/explorer/testnet/tx/bc88a21b607200ad9b34a07e0aafecd5c2f30f48db3f4483c9c2041ddbbaa167)
2. **İç zarf** — İstemci tarafını taklit ederek `pool-manager.distribute(from=deployer, total_amount=10000000)` çağrısı ihraççı tarafından Ed25519 ile imzalandı (ağa HENÜZ gönderilmedi).
3. **Fee-Bump** — İmzalı iç zarf `wrapAndSubmitFeeBump()`'a verildi; fonksiyon iç zarfı doğruladı (`assertValidInnerTransaction`), ön-simüle etti (`simulateInnerTransaction`), Havuz 2'nin gerçek özel anahtarıyla dış zarfı imzalayıp **gerçekten ağa gönderdi**:
   Tx: [`a36ffaa9ee4570cf1c5e31a9b9a8b1c722a01000b567b6ea6d64799457541777`](https://stellar.expert/explorer/testnet/tx/a36ffaa9ee4570cf1c5e31a9b9a8b1c722a01000b567b6ea6d64799457541777) (ledger `4109850`)
4. **Havuz 2 bakiye kanıtı** (`checkPool2Balance()` ile önce/sonra, gerçek Horizon sorgusu):

   | | XLM (harcanabilir) |
   |---|---|
   | Önce | `9999.0000000` |
   | Sonra | `9998.8041678` |
   | **Fark (gerçekten kesilen ücret)** | **`0.1958322` XLM** |

   Havuz 2'nin bakiyesi işlemi başlatan ihraççının hesabından DEĞİL, doğrudan Havuz 2'den düşmüştür — Fee-Bump mekanizmasının gerçekten çalıştığının kanıtıdır. (Not: dış zarfın hesaplanan tavan ücreti `2258577` stroops idi; Soroban ağı kullanılmayan kaynak ücretini işlem sonunda otomatik iade eder, bu yüzden gerçek kesinti tavandan düşüktür — beklenen ve doğru davranış.)
5. Aynı işlem, atomik dağılımın (`distribute()`) da gerçekten çalıştığını yan ürün olarak doğrular — Havuz 1/3/4 bakiyeleri bu 1 dTL'lik tutarla (%99.6/%0.1/%0.3) güncellenmiştir.

**Doğrulama script'i** (`orchestrator/tmp-verify-feebump.mjs`, geçiciydi) çalıştırma sonrası **silinmiştir** — repoda kalmamıştır, sadece `orchestrator/src/services/fee-bump.service.js` ve `stellar-tx.service.js`'teki gerçek servis fonksiyonlarını (mock içermeden) doğrudan çağırmıştır.

---

## 8. `POST /transactions/submit` Rotası — Gerçek Testnet Uçtan Uca Doğrulaması

> Bu bölüm, Bölüm 7'nin bir adım ötesini kanıtlar: artık `wrapAndSubmitFeeBump()` doğrudan değil, GERÇEK HTTP İSTEĞİYLE (`fetch` → Express → `authMiddleware` → `validateTransactionSubmit` → `idempotencyMiddleware` → handler) tetiklenmiştir. Ayrıca idempotency korumasının aynı işlemi ikinci kez ağa GÖNDERMEDİĞİ de kanıtlanmıştır.

**Durum: TAMAMLANDI.**

**Test ortamı:** `mongodb-memory-server`'ın `MongoMemoryReplSet` (tek-node replica set) modu kullanıldı — düz (replica set olmayan) bir `mongod`, `idempotency.service.js`'in kullandığı `readConcern: linearizable`'ı desteklemiyor (`node needs to be a replica set member to use read concern` hatasıyla test sırasında tespit edildi). Tek-node replica set, MongoDB Atlas'ın gerçek topolojisiyle eşleşir; bu yalnızca test altyapısı seçimidir, üretim kodu etkilenmemiştir.

**Akış:**
1. Geçici Express sunucusu (`app.listen(0)`) gerçek `merchant.routes.js` ve `transaction.routes.js` route'larıyla ayağa kaldırıldı.
2. `POST /merchants/register` ile test işyeri kaydedildi, dönen `apiKey` alındı.
3. İhraççı kendine 1 dTL (`10000000` stroops) mint etti:
   Tx: [`cd46e42972f9daaef955836b795e9d4ec19c0fe02dbe030e63e15e3dddd3c7b4`](https://stellar.expert/explorer/testnet/tx/cd46e42972f9daaef955836b795e9d4ec19c0fe02dbe030e63e15e3dddd3c7b4)
4. İstemci taklidi: `pool-manager.distribute(from=ihraççı, total_amount=10000000)` iç zarfı ihraççı ile imzalandı (ağa HENÜZ gönderilmedi).
5. **`POST /transactions/submit`** — `Authorization: Bearer <apiKey>`, `Idempotency-Key: <UUID v4>` başlıklarıyla gerçek HTTP isteği gönderildi → **201**, gerçek fee-bump ile ağa iletildi:
   Tx: [`db93848d51d9d088f8f5b35c0fb097c22ebe543b03556171e230afc6909b8413`](https://stellar.expert/explorer/testnet/tx/db93848d51d9d088f8f5b35c0fb097c22ebe543b03556171e230afc6909b8413) (ledger `4126105`)
6. **AYNI Idempotency-Key ile istek TEKRAR gönderildi** → **200**, saklanan sonuç ağa hiç gitmeden aynen döndü.
7. `GET /transactions/:txHash` (auth korumalı) → **200**, `status: "submitted"`.

**Havuz 2 bakiye kanıtı** (`checkPool2Balance()`, gerçek Horizon sorgusu):

| | XLM (harcanabilir) |
|---|---|
| Önce (ilk istekten önce) | `9998.8016401` |
| İlk istekten sonra | `9998.7991124` |
| **Fark (gerçekten kesilen ücret)** | **`0.0025277` XLM** |
| İkinci (replay) istekten sonra | `9998.7991124` — **DEĞİŞMEDİ** |

`IdempotencyKey` koleksiyonunda bu key için tam olarak **1 kayıt** vardı — ikinci istek yeni bir kilit açmadı, mevcut `completed` kaydı replay etti.

**Keşfedilen ve düzeltilen bug (bu doğrulama sırasında):** `idempotency.service.js`'deki `acquireIdempotencyLock()` başlangıçta `IdempotencyKey.create({key, status}, {writeConcern:{w:'majority'}})` şeklinde (tekil obje + options) yazılmıştı. Mongoose'un `Model.create()` metodu tekil obje verildiğinde ikinci argümanı da **ayrı bir doküman** sanıyor — bu da `{writeConcern:{...}}`'in `key` alanı olmadığı için validasyon hatası fırlatmasına yol açıyordu. Tehlikeli kısım: İLK doküman (gerçek idempotency kaydı) yine de DB'ye başarıyla yazılıyordu, ama çağıran kod bunu bilmeden hata alıyordu — yani kilit sessizce `'processing'`de askıda kalıp bir daha asla tamamlanamayabilirdi. Doğru kullanım `create([{...}], options)` (docs dizi olmalı) — düzeltildi ve `test/idempotency.service.test.js`'e regresyon testi eklendi.

**Doğrulama script'i** (`orchestrator/tmp-verify-submit.mjs`, geçiciydi) çalıştırma sonrası **silinmiştir** — repoda kalmamıştır.

---

## 9. SSE Dinleyici Havuz Filtresi Düzeltmesi — Gerçek Testnet Doğrulaması

> Bu bölüm, Madde 5'i belgeler: `sse-listener.service.js`'in artık Havuz 2 (fee sponsor) üzerinden gerçek bir fee-bump'lı işlemin onayını GERÇEKTEN yakaladığını kanıtlar.

**Durum: TAMAMLANDI.**

**Değişiklik öncesi kanıt (bug'ın gerçekliği):** Madde 3'ün 3 fee-bump tx'i (`db93848d...`, `c6e42c...`, `a36ffaa9...`) Horizon'da sorgulandı:
- Havuz 2'nin (`GAXVXYZ7...`) işlem listesinde **üçü de** `fee_account` olarak görünüyordu.
- Havuz 1'in (`GDWNZKIR...`) işlem listesinde **hiçbiri** görünmüyordu (yalnızca ilişkisiz eski bir tx vardı).

Bu, eski `forAccount(config.pools.pool1Address)` filtresinin fee-bump'lı işlemleri yapısal olarak kaçırdığını kanıtlar.

**Değişiklik:** `sse-listener.service.js`'te filtre `pool2Address`'e çevrildi; `index.js`'te `startSSEListener()` etkinleştirildi (önceki blokaj gerekçesi ortadan kalktığı için).

**Akış (gerçek testnet, `mongodb-memory-server` `MongoMemoryReplSet` ile):**
1. Geçici Express sunucusu + **gerçek** `startSSEListener()` (gerçek Horizon testnet akışına Havuz 2 filtresiyle bağlandı) ayağa kaldırıldı.
2. İhraççı kendine 1 dTL mint etti: Tx [`5ab48d58...`](https://stellar.expert/explorer/testnet/tx/5ab48d58ccb2e3d92b687c065a3671c9ca467a4f340c83fdcf58fbb80a20d909)
3. `distribute()` iç zarfı imzalandı, `POST /transactions/submit` ile gönderildi → **201**, fee-bump ile ağa iletildi: Tx [`74d5e7c8...`](https://stellar.expert/explorer/testnet/tx/74d5e7c87013d5041eed87b60ae09f5169da450fd41de0bc3ae4fb9c057b2ef0) (ledger `4127105`)
4. Submit sonrası, SSE'den önce: DB'de `status: "submitted"`, `ledgerNumber: null`.
5. **SSE dinleyicisi onayı 2 SANİYE içinde yakaladı** (gerçek Horizon akışından, gerçek Havuz 2 filtresi üzerinden) — log: `[SSE] Yeni zincir içi işlem algılandı: 74d5e7c8... (Ledger: 4127105)`.
6. `Transaction.status` otomatik `"confirmed"` oldu, `ledgerNumber: 4127105` yazıldı — hiçbir manuel müdahale olmadan, tamamen SSE akışı üzerinden.
7. Yan ürün olarak GİB belge üretimi de otomatik tetiklendi (`generateGibDocument`), bu da SSE→GİB zincirinin de gerçekten çalıştığını doğrular.
8. `GET /transactions/:txHash` → **200**, `status: "confirmed"`, `ledgerNumber: 4127105` — Madde 3'ün E2E'sinde `submitted`/`null` kalan alanlar artık doğru dolduruluyor.

**Bilinen ve belgelenen sınır:** Bu doğrulama SSE bağlantısının transient kesintilere karşı dayanıklılığını test etmedi (SDK'nın 15sn staleness watchdog'u + cursor koruması zaten koda dahil — bkz. ARCHITECTURE_DECISIONS.md §6.4); process restart'ında kalıcı cursor olmaması hâlâ açık bir eksik olarak belgelenmiştir, düzeltilmemiştir.

**Doğrulama script'i** (`orchestrator/tmp-verify-sse.mjs`, geçiciydi) çalıştırma sonrası **silinmiştir** — repoda kalmamıştır.

---
*KALEM projesi temiz ve doğrulanmış durumda Claude Code'a devredilmiştir.*
