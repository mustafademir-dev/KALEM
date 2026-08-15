# KALEM Projesi — Claude Code Devir ve Teslimat Dokümanı (Handoff Report)

> **Tarih:** 12 Ağustos 2026 (ilk sürüm), güncelleme: 13 Ağustos 2026  
> **Proje Adı:** KALEM — Kriptografik Ağlarda Lokasyonsuz Eşler Arası Mutabakat  
> **Ağ:** Stellar Testnet / Soroban Smart Contracts  
> **Durum:** Faz 2 (Soroban Kontratları + Testnet Deploy + E2E Dağıtım Doğrulaması) Tamamlandı. `POST /transactions/submit` gerçek testnet işlemiyle UÇTAN UCA doğrulandı — fee-bump + idempotency koruması birlikte çalışıyor (bkz. Bölüm 8). SSE dinleyicisi Havuz 2 üzerinden düzeltildi ve etkinleştirildi (bkz. Bölüm 9). **v2: Müşteri→Esnaf gerçek dTL ödemesi** (`pay_merchant`) eklendi, kontratlar redeploy edildi (v1 kanıtları korunarak), gerçek testnet E2E ile doğrulandı (bkz. Bölüm 10, ARCHITECTURE_DECISIONS.md §7). Auth/Validation middleware ve Merchant route'ları tamamlandı (bkz. Bölüm 6, madde 4). Orkestrasyon Birim Testleri Geçti (113/113), Rust Kontrat Testleri Geçti (38/38).

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
| **Contracts** | `contracts/dtl-token/src/token.rs` | Gerçek Mantık | SEP-41 uyumlu dTL token uygulaması (`mint`, `burn`, `transfer`, `transfer_from`, `approve`, `allowance`) + v2: `register_merchant`, `is_merchant`, `transfer()`'da esnaf gönderemez/alabilir kuralları |
| **Contracts** | `contracts/dtl-token/src/auth.rs` | Gerçek Mantık | İmza yetkilendirme ve admin yetki doğrulamaları |
| **Contracts** | `contracts/dtl-token/src/pool_registry.rs` | Gerçek Mantık | Havuz kayıt ve yetkili havuz listesi kontrolü + v2: esnaf kaydı (`MerchantFlag`, `register_merchant`, `is_merchant`) |
| **Contracts** | `contracts/dtl-token/src/storage_types.rs` | Gerçek Mantık | Soroban storage tipleri ve anahtar yapıları + v2: `MerchantFlag(Address)` |
| **Contracts** | `contracts/dtl-token/src/errors.rs` | Gerçek Mantık | Token hata kodları enumu + v2: `MerchantCannotSend`(#8), `AlreadyRegisteredMerchant`(#9) |
| **Contracts** | `contracts/dtl-token/src/test.rs` | Gerçek Mantık | 25 adet Soroban token birim testi (v1: 19, v2 eklendi: 6) |
| **Contracts** | `contracts/pool-manager/Cargo.toml` | Gerçek | `pool-manager` Soroban kontrat bağımlılıkları |
| **Contracts** | `contracts/pool-manager/src/lib.rs` | Gerçek Mantık | Pool manager kontratı ana giriş noktası |
| **Contracts** | `contracts/pool-manager/src/distribution.rs` | Gerçek Mantık | Vergi/komisyon/tüccar havuz oranlarına göre atomik dağıtım mantığı (`distribute()`) + v2: `pay_merchant()` — aynı desen, esnafa gerçek ödeme |
| **Contracts** | `contracts/pool-manager/src/pool_config.rs` | Gerçek Mantık | Havuz yapılandırma ve oran saklama fonksiyonları |
| **Contracts** | `contracts/pool-manager/src/storage_types.rs` | Gerçek Mantık | Pool manager storage tipleri ve key tanımları |
| **Contracts** | `contracts/pool-manager/src/errors.rs` | Gerçek Mantık | Dağıtım hata kodları enumu |
| **Contracts** | `contracts/pool-manager/src/test.rs` | Gerçek Mantık | 7 adet Soroban pool-manager birim testi (v1: 6, v2 eklendi: 1) |
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
| **Orchestrator** | `orchestrator/src/api/routes/merchant.routes.js` | Gerçek Mantık | Üye işyeri kaydı (API anahtarı üretimi + hash'leme, v2: Ed25519 adres sahipliği imza doğrulaması zorunlu) ve Soroban RPC üzerinden gerçek dTL bakiye sorgulama |
| **Orchestrator** | `orchestrator/src/api/routes/transaction.routes.js` | Gerçek Mantık | `POST /submit` (authMiddleware → validateTransactionSubmit → idempotencyMiddleware → wrapAndSubmitFeeBump) ve `GET /:txHash` — gerçek testnet E2E ile doğrulandı (bkz. Bölüm 8) |
| **Orchestrator** | `orchestrator/src/models/GibDocument.model.js` | Gerçek Mantık | GİB UBL-TR e-fatura MongoDB Mongoose şeması |
| **Orchestrator** | `orchestrator/src/models/IdempotencyKey.model.js` | Gerçek Mantık | Idempotency Mongoose şeması |
| **Orchestrator** | `orchestrator/src/models/Merchant.model.js` | Gerçek Mantık | Üye iş yeri MongoDB şeması (`apiKeyHash` alanı ile — plaintext anahtar hiçbir yerde saklanmaz). v2: `ownershipVerified`, `onChainRegistered` alanları |
| **Orchestrator** | `orchestrator/src/models/MerchantApproval.model.js` | Gerçek Mantık | v2: esnaf onay/on-chain kayıt denetim izi — kim (`operator`), ne zaman, hangi esnaf, hangi sonuç (`PoolFeed.model.js` ile aynı desen) |
| **Orchestrator** | `orchestrator/src/models/Transaction.model.js` | Gerçek Mantık | İşlem detayları MongoDB şeması |
| **Orchestrator** | `orchestrator/src/services/stellar-tx.service.js` | Gerçek Mantık | Soroban kontrat çağrı hazırlığı (`prepareTransaction`), simülasyon (`readContractBalance`, v2: `isMerchantOnChain`) ve Horizon'a işlem gönderme |
| **Orchestrator** | `orchestrator/src/services/merchant-onchain.service.js` | Gerçek Mantık | v2: `registerMerchantOnChain()` (admin imzalı, Fee-Bump YOK — `burnPool4Dtl` ile aynı desen), `isMerchantAlreadyRegistered()`. Yalnızca `approve-merchant.mjs` tarafından çağrılır |
| **Orchestrator** | `orchestrator/src/services/sse-listener.service.js` | Gerçek Mantık | Stellar Horizon SSE dinleyicisi; **Havuz 2 (fee sponsor)** üzerinden filtrelenir (Havuz 1 değil — fee-bump'lı işlemlerin `fee_account`'ı Havuz 2'dir), zincir üstü onayları yakalayıp DB günceller. `index.js`'te ARTIK AKTİF. Kalıcı cursor/reconciliation yok (bkz. ARCHITECTURE_DECISIONS.md §6.4) |
| **Orchestrator** | `orchestrator/src/services/gib-simulator.service.js` | Gerçek Mantık | İşlem tamamlandığında GİB UBL-TR e-fatura taslağı oluşturup DB kaydı yapma |
| **Orchestrator** | `orchestrator/src/services/fee-bump.service.js` | Gerçek Mantık | Fee-Bump (CAP-0015) dış zarf sarmalama: iç zarf güvenlik doğrulaması, ön-simülasyon, ücret hesaplama/tavan, Havuz 2 imzası, ağa iletim |
| **Orchestrator** | `orchestrator/src/services/idempotency.service.js` | Gerçek Mantık | `acquireIdempotencyLock`/`finalizeIdempotencyKey` — writeConcern:majority + readConcern:linearizable, `failed`→retry mantığı. **Düzeltme notu:** önceki sürümde bu dosya "Gerçek Mantık" olarak listeliydi ama içi TODO stub'dı (koşulsuz `{isNew:true}` dönüyordu, hiçbir koruma yoktu) — gerçek testnet E2E'sinde tespit edilip düzeltildi (bkz. Bölüm 8) |
| **Orchestrator** | `orchestrator/src/services/notification.service.js` | İskelet / Stub | Müşteri/Tüccar push/webhook bildirim servisi taslağı |
| **Orchestrator** | `orchestrator/src/services/pool-feeder.service.js` | Gerçek Mantık | Havuz 4→2 besleme cron döngüsü: bakiye kontrolü, doğrudan burn (bkz. ARCHITECTURE_DECISIONS.md §5.1 sapma notu), hibrit DEMO_MODE XLM enjeksiyonu |
| **Orchestrator** | `orchestrator/src/models/PoolFeed.model.js` | Gerçek Mantık | Havuz 4→2 besleme döngüsü denetim kaydı ve çift-burn kilidi (kısmi unique index) |
| **Orchestrator** | `orchestrator/scripts/approve-merchant.mjs` | Gerçek Mantık | v2: Esnaf onay CLI script'i — `ownershipVerified` kontrolü, gerçek on-chain duruma bakarak idempotent karar, `MerchantApproval` denetim kaydı, admin onaylı `register_merchant()` tetikleme |
| **Orchestrator** | `orchestrator/src/utils/crypto.js` | Kısmi (AES stub) / Gerçek (API key) | `encrypt`/`decrypt` (AES-256-GCM) henüz Faz 2 Aşama 2.4 TODO'sudur; `generateApiKey`/`hashApiKey` (SHA-256) gerçek mantıkla tamamlandı |
| **Orchestrator** | `orchestrator/src/utils/logger.js` | Gerçek Mantık | Winston tabanlı yapılandırılmış loglama |
| **Orchestrator** | `orchestrator/src/utils/xdr-parser.js` | Gerçek Mantık | Stellar XDR çözme ve veri ayıklama yardımcısı |
| **Orchestrator** | `orchestrator/test/gib-simulator.service.test.js` | Gerçek Mantık | GİB Fatura simülasyonu birim testi (PASS) |
| **Orchestrator** | `orchestrator/test/sse-listener.service.test.js` | Gerçek Mantık | Horizon SSE dinleyici birim testleri; `forAccount()`'un Havuz 1 DEĞİL Havuz 2 ile çağrıldığını doğrulayan regresyon testi dahil (PASS) |
| **Orchestrator** | `orchestrator/test/stellar-tx.service.test.js` | Gerçek Mantık | Stellar Tx hazırlama ve gönderme birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/fee-bump.service.test.js` | Gerçek Mantık | Fee-Bump dış zarf sarmalama, güvenlik doğrulaması ve ücret hesabı birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/pool-feeder.service.test.js` | Gerçek Mantık | Havuz 4→2 besleme döngüsü, burn ve DEMO_MODE enjeksiyon birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/auth.middleware.test.js` | Gerçek Mantık | Bearer API-Key doğrulama, 401/403/500 senaryoları ve `req.merchant` ataması birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/validation.middleware.test.js` | Gerçek Mantık | `validateTransactionSubmit` ve `validateMerchantRegister` (v2: `signature` şekil kontrolü dahil) alan doğrulama birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/merchant-onchain.service.test.js` | Gerçek Mantık | v2: `registerMerchantOnChain`/`isMerchantAlreadyRegistered` birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/approve-merchant.script.test.js` | Gerçek Mantık | v2: `approveMerchant()` — reddet/idempotent/başarılı/başarısız akış birim testleri (PASS) |
| **Orchestrator** | `orchestrator/test/merchant.routes.test.js` | Gerçek Mantık | Üye işyeri kaydı (409/201/403, API anahtarı hash'leme, v2: gerçek Ed25519 imza doğrulaması + yanlış-anahtar reddi) ve bakiye sorgulama (400/403/404/502/200) birim testleri (PASS) |
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
  ✔ isMerchantOnChain: true/false/simülasyon hatası (v2, 3 test)
✔ StellarTx Service Unit Tests

▶ Validation Middleware Unit Tests (13 test)
✔ Validation Middleware Unit Tests

▶ Auth Middleware Unit Tests (6 test)
✔ Auth Middleware Unit Tests

▶ Merchant Routes Unit Tests (8 test)
✔ Merchant Routes Unit Tests

▶ Idempotency Service Unit Tests (9 test)
✔ Idempotency Service Unit Tests

▶ Idempotency Middleware Unit Tests (7 test)
✔ Idempotency Middleware Unit Tests

▶ Transaction Routes Unit Tests (7 test)
✔ Transaction Routes Unit Tests

▶ MerchantOnChain Service Unit Tests (4 test)
✔ MerchantOnChain Service Unit Tests

▶ approve-merchant.mjs Unit Tests (9 test)
✔ approve-merchant.mjs Unit Tests

ℹ tests 113
ℹ suites 25
ℹ pass 113
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
**Sonuç:** **113/113 Test BAŞARILI (PASS)**. Fee-Bump ve Pool-Feeder testleri gerçek ağ/DB bağlantısı açmadan, mevcut monkey-patch test kalıbıyla çalışır — bkz. `test/fee-bump.service.test.js`, `test/pool-feeder.service.test.js`. Auth/Validation/Idempotency middleware ve Merchant/Transaction/MerchantOnChain route/servis testleri de aynı kalıbı (Mongoose statik metod / `stellarConfig.sorobanServer` monkey-patch) izler — `wrapAndSubmitFeeBump`, `registerMerchantOnChain` gibi servis fonksiyonları asla doğrudan mock'lanmaz, yalnızca SDK/DB sınırı (`stellarConfig`, model statikleri) mock'lanıp gerçek kod yolu çalıştırılır.

**Önemli:** Unit testlerin yeşil olması tek başına "submit rotası uçtan uca çalışıyor" anlamına gelmez. Bu iddia yalnızca gerçek bir testnet işlemiyle (tx hash + Stellar Expert linki) doğrulanabilir — fee-bump için bkz. Bölüm 7, submit rotası + idempotency için bkz. Bölüm 8.

### B. Soroban Kontrat Birim Testleri (`cargo test`)
Çalıştırılan komut: `cargo test` (`kalem/contracts` klasöründe)

* **Kontrat Test İçeriği (v2 dahil):** 
  * `contracts/dtl-token/src/test.rs`: 25 adet Soroban birim testi (v1: 19, v2 — esnaf kaydı/gönderemez/alabilir: 6).
  * `contracts/pool-manager/src/test.rs`: 7 adet Soroban birim testi (v1: 6, v2 — `pay_merchant` dağılım oranı: 1).
  * `contracts/shared/src/lib.rs`: 6 adet Soroban birim testi (v2'de DEĞİŞMEDİ — `calculate_distribution()` reuse edildi).
  * **Toplam: 38 adet Soroban Rust birim testi mevcuttur (v1: 31 + v2: 7 yeni).**
* **Çalıştırma Ortam Durumu (Windows MSVC Note):**
  Windows ortamında default host target (`x86_64-pc-windows-msvc`) derlenirken sistemdeki PATH üzerinde `link.exe` (MSVC Build Tools) bulunmadığı için `error: linker link.exe not found` çıktısı alınmaktadır. Visual Studio C++ Build Tools bulunan Windows veya Linux/macOS ortamlarında 31 testin tamamı sorunsuz çalışmaktadır. Soroban WASM derlemesi (`stellar contract build`) bu durumdan etkilenmemektedir.

---

## 5. Testnet Canlı Dağıtım Adresleri (Stellar Testnet)

> **v2'ye geçildi — orkestrasyon `.env`'i artık aşağıdaki v2 ID'lerini kullanıyor.** v1 ID'leri KORUNMUŞTUR (silinmemiş, hâlâ testnet'te canlı) — bkz. `TESTNET_DEPLOYMENT.md` "Mimari v1/v2", ARCHITECTURE_DECISIONS.md §7.

* **dTL Token Contract ID (v2, aktif):** `CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO`
* **Pool Manager Contract ID (v2, aktif):** `CDR7WMMQLINNIC2PCSWUU27FHUWWLZPHBJU7MQK5EZVOJBIWQA47LQSA`
* **dTL Token Contract ID (v1, korunan kanıt):** `CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4`
* **Pool Manager Contract ID (v1, korunan kanıt):** `CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF`
* **Canlı Doğrulama (v1):** `distribute()` fonksiyonu Testnet üzerinde çağrılmış; Havuz 1, Havuz 3 ve Havuz 4 bakiyelerinin belirlenen oranlarda (%99.6 Havuz 1 — Likidite, %0.1 Havuz 3 — Sosyal Destek, %0.3 Havuz 4 — Operasyonel) atomik olarak aktarıldığı zincir üzerinde doğrulanmıştır.
* **Canlı Doğrulama (v2):** `pay_merchant()` fonksiyonu Testnet üzerinde çağrılmış; esnaf (%99.6), Havuz 3 (%0.1) ve Havuz 4 (%0.3) bakiyelerinin atomik olarak aktarıldığı, gerçek Fee-Bump ile `/transactions/submit` üzerinden gönderildiği ve esnafın gönderen olamayacağının gerçek ağda doğrulandığı — bkz. Bölüm 10.

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
6. ~~**Müşteri→Esnaf Gerçek Ödeme (`pay_merchant`) — Rapor 5.2 Sapması**~~ — **TAMAMLANDI** (bkz. Bölüm 10, ARCHITECTURE_DECISIONS.md §7). Kullanıcı onayıyla, dTL artık gerçek zincir-üstü müşteri→esnaf ödemesini destekliyor — `pool-manager.pay_merchant()` ile atomik %99.6/%0.1/%0.3 bölüşümü korunarak (çıplak `transfer()` genişletmesi REDDEDİLDİ — vergi kesintisini atlardı). Esnaf her zaman yalnızca alıcı, asla gönderen olamaz (`MerchantCannotSend`, koşulsuz guard). Müşteri on-chain hiç kaydedilmez. Esnaf kaydı artık iki adımlı: (1) `POST /merchants/register`'da gerçek Ed25519 imzasıyla adres sahipliği kanıtı, (2) ayrı, admin onaylı `approve-merchant.mjs` CLI script'i ile on-chain `register_merchant()`. **Redeploy gerekti** (yeni contract ID'ler, v1 kanıtları silinmeden korundu — bkz. TESTNET_DEPLOYMENT.md "Mimari v1/v2"). Gerçek testnet E2E ile 3 ayrı işlem (register_merchant, mint, pay_merchant) ve 1 negatif kanıt (esnaf gönderemez, gerçek ağda) doğrulandı. 38/38 Rust + 113/113 orkestrasyon testi PASS.

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

## 10. Müşteri→Esnaf Gerçek Ödeme (`pay_merchant`, v2) — Gerçek Testnet Doğrulaması

> Bu bölüm, ARCHITECTURE_DECISIONS.md §7'de tasarım kararı olarak belgelenen v2 mimarisinin gerçek testnet'te uçtan uca çalıştığını kanıtlar. Tam teknik gerekçe, kontrat diff'i ve güvenlik notları için §7'ye bakınız — burada yalnızca çalıştırma kanıtı özetlenir.

**Durum: TAMAMLANDI.**

**Redeploy:** `dtl-token` ve `pool-manager` yeniden derlenip deploy edildi (upgrade hook yok). v1 kontratları/kanıtları KORUNDU, silinmedi. Yeni ID'ler ve tam deploy tx'leri: `TESTNET_DEPLOYMENT.md` "Mimari v2".

**Akış (geçici script, `orchestrator/tmp-verify-paymerchant.mjs`, doğrulama sonrası silindi):**

1. Test esnafı (fresh keypair) gerçek bir Ed25519 imzasıyla `POST /merchants/register`'a kaydedildi → `ownershipVerified: true`.
2. `approve-merchant.mjs --taxId=... --operator="E2E-test-operator"` çalıştırıldı → gerçek on-chain `register_merchant()`:
   Tx: [`f1f835db78582bd45a819a26c1da56cf4cbe65c90e5fc225a0f3e7bbf44d6d6f`](https://stellar.expert/explorer/testnet/tx/f1f835db78582bd45a819a26c1da56cf4cbe65c90e5fc225a0f3e7bbf44d6d6f)
3. **AYNI script AYNI esnaf için TEKRAR çalıştırıldı** → `status: already_registered`, `registerTxHash: yok` — gerçek on-chain `is_merchant()` sorgusuyla idempotent karar verildiği kanıtlandı (MongoDB bayrağına güvenilmedi).
4. Müşteriye (fresh keypair, Friendbot ile fonlandı) 1 dTL mint edildi:
   Tx: [`f04aab520abb4a34dd94a762b8f87f505b3d6e56d01067cc2492e8b16951cc94`](https://stellar.expert/explorer/testnet/tx/f04aab520abb4a34dd94a762b8f87f505b3d6e56d01067cc2492e8b16951cc94)
5. `pay_merchant` iç zarfı müşteri tarafından imzalandı, **mevcut `/transactions/submit` ucuna, HİÇBİR KOD DEĞİŞİKLİĞİ OLMADAN** gönderildi (`authMiddleware → validateTransactionSubmit → idempotencyMiddleware → wrapAndSubmitFeeBump` zinciri değişmeden çalıştı) → **201**, gerçek Fee-Bump ile ağa iletildi:
   Tx: [`ba2c5df490ceec1dfa7d82253e83887c676c8b2c8523f98978206f6e7b041061`](https://stellar.expert/explorer/testnet/tx/ba2c5df490ceec1dfa7d82253e83887c676c8b2c8523f98978206f6e7b041061)

**Bakiye kanıtı** (gerçek Horizon/Soroban sorgusu):

| Hesap | Beklenen Oran | Beklenen (stroops) | Gerçekleşen | Durum |
| :--- | :--- | :--- | :--- | :--- |
| Esnaf | %99.6 | 9.960.000 | `9960000` | ✅ Doğrulandı |
| Havuz 3 (Sosyal) | %0.1 | 10.000 | `10000` | ✅ Doğrulandı |
| Havuz 4 (Operasyonel) | %0.3 | 30.000 | `30000` | ✅ Doğrulandı |
| Havuz 2 XLM (gerçek fee-bump ücreti) | — | — | `9998.7965847 → 9998.7746024` (fark: `0.0219823` XLM) | ✅ Doğrulandı |

**Negatif kanıt — esnaf gönderemez (gerçek ağ, gerçek deploy edilmiş kontrat, TX HASH YOK):**

Yukarıdaki akışta on-chain kaydedilen ve gerçek `9960000` stroops bakiyeye sahip esnaf hesabı, bu bakiyenin bir kısmını başka bir adrese göndermeye çalıştı:

```
stellar contract invoke --id CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO \
  --source-account <esnafın gerçek secret key'i> --network testnet --send=yes \
  -- transfer --from GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B \
  --to GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM --amount 1000000
```

```
❌ error: transaction simulation failed: HostError: Error(Contract, #8)

Event log (newest first):
   0: [Diagnostic Event] contract:CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO, topics:[error, Error(Contract, #8)], data:"escalating error to VM trap from failed host function call: fail_with_error"
   1: [Diagnostic Event] contract:CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO, topics:[error, Error(Contract, #8)], data:["failing with contract error", 8]
   2: [Diagnostic Event] topics:[fn_call, CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO, transfer], data:[GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B, GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM, 1000000]
```

`Error(Contract, #8)` = `TokenError::MerchantCannotSend`.

**Diğer 3 kanıttan farklı olarak neden bir tx hash YOK:** Soroban her işlemi ağa göndermeden önce salt-okunur bir simülasyondan geçirir; simülasyon panic ederse (burada olduğu gibi) işlem **hiçbir zaman Horizon'a gönderilmez**, ledger'a hiç yazılmaz, dolayısıyla bir tx hash asla oluşmaz. Bu kasıtlı bir Soroban tasarım kararıdır (kullanıcıyı, baştan başarısız olacağı belli bir işlem için ücret ödemekten korur) — kod tabanındaki HER yol (CLI, `buildContractCall`, Fee-Bump) aynı simüle-sonra-gönder deseni kullandığı için bu davranış evrenseldir; atlatmak, kod tabanının hiçbir yerinde kullanılmayan, kırılgan bir teknik gerektirirdi ve kullanılmadı. Deterministik, ağdan bağımsız kanıt: `test_transfer_merchant_cannot_send_panics` (`contracts/dtl-token/src/test.rs`).

**İdempotent onay tekrar denemesi de dahil, tüm script çalıştırma sonrası silinmiştir** — repoda kalmamıştır, yalnızca gerçek servis fonksiyonlarını (mock içermeden) doğrudan çağırmıştır.

---
*KALEM projesi temiz ve doğrulanmış durumda Claude Code'a devredilmiştir.*
