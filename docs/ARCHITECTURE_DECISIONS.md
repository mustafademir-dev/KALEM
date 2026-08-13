# KALEM — Mimari Kararlar ve Derleme Dokümantasyonu (ARCHITECTURE_DECISIONS.md)

> Bu belge, KALEM projesinin mimari kararlarını, derleme ortamını ve doğrulanmış test/WASM sonuçlarını içerir.

---

## 1. Modüler Derleme Mimarisi (WSL2 / Ubuntu Integration)

KALEM projesinde **hibrit mimari** benimsenmiştir:
- **`contracts/` (Rust / Soroban)**: Linux (WSL2 / Ubuntu) dosya sisteminde (`~/kalem-contracts`) isolated "derleme laboratuvarı" olarak `stellar-cli` ile derlenir ve doğrulanır. Doğrulanan kaynak kodlar Windows'taki ana repository'ye senkronize edilir.
- **`orchestrator/` (Node.js + MongoDB)** & **`client/` (React Native Expo)**: Windows ortamında tutulur ve çalıştırılır.

---

## 2. SEP-41 Devre Dışı Fonksiyonlar ve Kapalı Devre Güvenlik Doğrulaması

dTL (dijital Türk Lirası test taşıyıcısı), kapalı devre bir varlıktır. Bu nedenle SEP-41 standart token arayüzünün gerektirdiği delegasyon/izin fonksiyonları (`allowance`, `approve`, `transfer_from`) **kasıtlı olarak devre dışı bırakılmış** ve çağrıldıklarında doğrudan panic döndürecek şekilde kodlanmıştır:

### A. Kod İncelemesi (`contracts/dtl-token/src/token.rs` L341-L354)

```rust
/// SEP-41: Allowance sorgulama — dTL için devre dışı.
pub fn allowance(_env: Env, _from: Address, _spender: Address) -> i128 {
    panic!("dTL kapalı devre varliktir: allowance desteklenmez")
}

/// SEP-41: Approve — dTL için devre dışı.
pub fn approve(_env: Env, _from: Address, _spender: Address, _amount: i128, _live_until_ledger: u32) {
    panic!("dTL kapalı devre varliktir: approve desteklenmez")
}

/// SEP-41: Transfer from (delegasyonlu) — dTL için devre dışı.
pub fn transfer_from(_env: Env, _spender: Address, _from: Address, _to: Address, _amount: i128) {
    panic!("dTL kapalı devre varliktir: transfer_from desteklenmez")
}
```

### B. Birim Test Doğrulaması (`contracts/dtl-token/src/test.rs` L294-L320)

```rust
#[test]
#[should_panic]
fn test_allowance_panics() {
    let t = setup();
    let a = Address::generate(&t.env);
    let b = Address::generate(&t.env);
    t.client.allowance(&a, &b);
}

#[test]
#[should_panic]
fn test_approve_panics() {
    let t = setup();
    let a = Address::generate(&t.env);
    let b = Address::generate(&t.env);
    t.client.approve(&a, &b, &100, &1000);
}

#[test]
#[should_panic]
fn test_transfer_from_panics() {
    let t = setup();
    let a = Address::generate(&t.env);
    let b = Address::generate(&t.env);
    let c = Address::generate(&t.env);
    t.client.transfer_from(&a, &b, &c, &100);
}
```

---

## 3. Derleme ve Test Doğrulama Sonuçları (10 Ağustos 2026)

### A. Soroban WASM Output (`stellar contract build` / `wasm32v1-none`)

#### 1. `kalem_dtl_token.wasm`
- **Dosya Boyutu:** 12,009 bytes (~12 KB)
- **WASM Hash:** `c1ad6c61e0047da8967265b45a4527fdbd5782451b072e6aa45f6507e0e82cc6`
- **Dışa Aktarılan Semboller (12):** `initialize`, `mint`, `burn`, `transfer`, `balance`, `name`, `symbol`, `decimals`, `total_supply`, `allowance`, `approve`, `transfer_from`

#### 2. `kalem_pool_manager.wasm`
- **Dosya Boyutu:** 8,709 bytes (~8.7 KB)
- **WASM Hash:** `115f8a4d46a2cbd4e6048dcd4a1f366e19d7add74fecaac88220099ea0762bb8`
- **Dışa Aktarılan Semboller (3):** `initialize`, `distribute`, `get_config`

---

### B. Birim Test Sonuçları (`cargo test --workspace`)

Toplam **31 birim testi** çalıştırılmış ve **%100 başarı (0 hata)** ile tamamlanmıştır:

```text
running 19 tests in kalem-dtl-token:
- test_initialize_metadata .................... ok
- test_double_initialize_panics .............. ok (should panic)
- test_mint_success ........................... ok
- test_mint_multiple .......................... ok
- test_mint_zero_amount_panics ................ ok (should panic)
- test_mint_negative_amount_panics ............ ok (should panic)
- test_burn_success ........................... ok
- test_burn_insufficient_balance_panics ....... ok (should panic)
- test_transfer_to_pool1_success .............. ok
- test_transfer_to_pool3_success .............. ok
- test_transfer_to_pool4_success .............. ok
- test_transfer_p2p_blocked .................... ok (should panic: UnauthorizedRecipient #2)
- test_transfer_insufficient_balance_panics ... ok (should panic)
- test_transfer_zero_amount_panics ............ ok (should panic)
- test_balance_nonexistent_address_returns_zero ok
- test_allowance_panics ....................... ok (should panic: dTL kapalı devre)
- test_approve_panics ......................... ok (should panic: dTL kapalı devre)
- test_transfer_from_panics .................. ok (should panic: dTL kapalı devre)
- test_invalid_pool_type_panics ............... ok (should panic: InvalidPoolType #7)

test result: ok. 19 passed; 0 failed.

running 6 tests in kalem-pool-manager:
- test_initialize_success ..................... ok
- test_double_initialize_panics .............. ok (should panic)
- test_get_config_returns_correct_addresses ... ok
- test_distribution_ratios_basic .............. ok (%99.6, %0.1, %0.3)
- test_distribution_ratios_large_amount ....... ok
- test_distribution_ratios_rounding ........... ok

test result: ok. 6 passed; 0 failed.

running 6 tests in kalem-shared:
- test_ratios_sum_to_1000 ..................... ok
- test_calculate_distribution_basic ........... ok
- test_calculate_distribution_preserves_total . ok
- test_calculate_distribution_small_amount .... ok
- test_calculate_distribution_zero_panics ..... ok (should panic)
- test_calculate_distribution_negative_panics . ok (should panic)

test result: ok. 6 passed; 0 failed.

TOTAL: 31 passed; 0 failed; 0 ignored.
```

---

## 4. Stellar Testnet Deployment ve On-Chain Doğrulama (10 Ağustos 2026)

Kontratlar ve birim testler (31/31) doğrulandıktan sonra Stellar Testnet ortamında canlıya alınmış ve atomik dağılım testi on-chain olarak doğrulanmıştır.

### A. Kontrat ve Hesap Adresleri

| Varlık / Kontrat | Alias / Tanım | Adres / Contract ID |
| :--- | :--- | :--- |
| **Deployer / Admin** | `deployer` | `GAAAUEICPJWHDM23K3RG7HPUFKGZGWXQIPQ5ER76DLD4OJ5UNLX6T6K4` |
| **`dtl-token` Contract** | Soroban Custom Token | `CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4` |
| **`pool-manager` Contract** | Atomik Dağılım Kontratı | `CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF` |
| **Havuz 1 (Likidite Hazinesi)** | `pool1` (`SorobanAddress`) | `GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM` |
| **Havuz 2 (Gaz Sponsor Havuzu)** | `pool2` (`StellarAccount`) | `GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK` |
| **Havuz 3 (Sosyal Destek Fonu)** | `pool3` (`SorobanAddress`) | `GDIRKWQXXJDNHLVZHTO7USR3FBSTOW7LXEJY7LSML75LSEWJA7EMXJOQ` |
| **Havuz 4 (Operasyonel Gelir)** | `pool4` (`SorobanAddress`) | `GBOOXSBUSUUEWK57OBKQU7WUA7V36DZATXY54ACH2V56537QBHSMV3CQ` |

### B. On-Chain E2E Dağılım Test Sonuçları

1. **Mint**: `1,000,000,000` stroops (100.0000000 dTL) `deployer` adresine basıldı (TX: [`c133f5f007bd71971635c09ad7d1928ba3f570804b49fdc8095f644d35f8804d`](https://stellar.expert/explorer/testnet/tx/c133f5f007bd71971635c09ad7d1928ba3f570804b49fdc8095f644d35f8804d)).
2. **Distribute**: `pool-manager.distribute()` ile 1.000.000.000 stroops 3 havuza atomik dağıtıldı (TX: [`a3ca5ad1814a16e24980b6afa92791d01b086a978856c0870565a3964607136c`](https://stellar.expert/explorer/testnet/tx/a3ca5ad1814a16e24980b6afa92791d01b086a978856c0870565a3964607136c)).
3. **Sorgulanan On-Chain Bakiyeler**:
   - Havuz 1 (%99.6): `996,000,000` stroops
   - Havuz 2 (Gaz Sponsor / XLM): `0` dTL (XLM hesabı)
   - Havuz 3 (%0.1): `1,000,000` stroops
   - Havuz 4 (%0.3): `3,000,000` stroops
   - Gönderen Kalan Bakiye: `0` stroops

Detaylı komut çıktıları ve konfigürasyonlar [TESTNET_DEPLOYMENT.md](file:///c:/Users/musta/OneDrive/Masa%C3%BCst%C3%BC/teknofest%20proje%20uygulama/kalem/docs/TESTNET_DEPLOYMENT.md) dosyasında belgelenmiştir.

---

## 5. Bilinen Sapmalar ve Implementasyon Notları

> Bu bölüm, orkestrasyon katmanı (`orchestrator/src/services/`) implementasyonu sırasında rapor metni ile kontrat kodu arasında bulunan ve kullanıcı onayıyla çözülen mimari sapmaları belgeler. Yukarıdaki bölümlerdeki (1-4) kararlar DEĞİŞTİRİLMEMİŞTİR; bu bölüm yalnızca EK bir açıklama katmanıdır.

### 5.1. Havuz 4 → Havuz 2 Besleme Akışında Burn Sapması

**Rapor metni (KALEM_Proje_Raporu_Duzeltilmis.pdf, Bölüm 5.3.1):** "Havuz 4'teki dTL, ihraççıya (kurumsal hazineye) gönderilir ve sözleşme seviyesinde yakılır (burn)."

**Neden zincirde yürütülemez:**
- `contracts/dtl-token/src/token.rs` (`transfer()`, satır ~255-267): alıcı (`to`) adresinin `pool_registry::is_authorized_recipient()` ile kayıtlı 4 havuzdan (Havuz 1/2/3/4) biri olduğu doğrulanır. İhraççı/admin adresi (`GAAAUEICPJWHDM23K3RG7HPUFKGZGWXQIPQ5ER76DLD4OJ5UNLX6T6K4`) bu 4 havuzdan biri DEĞİLDİR — dolayısıyla `transfer(from=Havuz4, to=ihraççı, ...)` çağrısı `UnauthorizedRecipient` (#2) hatasıyla reddedilir.
- Aynı fonksiyon `from.require_auth()` da ister (token.rs, satır ~257) — yani Havuz 4'ün KENDİSİNİN bu transferi imzalaması gerekir. Orkestrasyon katmanı (`orchestrator/src/config/index.js`) yalnızca Havuz 2 (`POOL2_SECRET_KEY`) ve ihraççı (`ISSUER_SECRET_KEY`) özel anahtarlarını tutar; Havuz 4'ün kendi imza anahtarı hiçbir yerde saklanmaz/tutulmaz.

**Uygulanan çözüm:** Transfer adımı atlanır; ihraççı `dtl-token.burn(from = Havuz4Adresi, amount)` fonksiyonunu DOĞRUDAN çağırır. `burn()` fonksiyonu (`token.rs`, satır ~212-235) yalnızca `auth::require_admin()` çağırır — bu da yalnızca ÇAĞIRANIN (ihraççı/admin) `require_auth()` sağlamasını ister (`auth.rs`, `require_admin`); `from` parametresi için `from.require_auth()` ÇAĞRILMAZ. Dolayısıyla tek bir admin imzası, Havuz 4'ün bakiyesini yakmak için yeterli ve tek uygulanabilir yoldur.

**Ekonomik sonuç:** Rapor ile birebir aynıdır — Havuz 4'ün dTL bakiyesi ve toplam arz (`total_supply`) aynı miktarda azalır. Fark yalnızca ara transfer adımının (ve onun event izinin) oluşmamasıdır; muhasebe izi doğrudan `burn` event'i üzerinden takip edilir.

**Kapsam:** Kontrat DEĞİŞTİRİLMEMİŞ, yeniden derlenmemiş, redeploy EDİLMEMİŞTİR. Bölüm 3 ve 4'te belgelenen WASM hash'leri, contract ID'leri ve 31 birim test sonucu geçerliliğini korur.

**Yan not — ihraççı clawback yetkisi:** `burn()`'ün `from.require_auth()` istememesi, dolaylı bir sonuç olarak ihraççıya, teknik açıdan HERHANGİ bir adresin (Havuz 1'deki esnaf bakiyeleri dahil) bakiyesini o adresin onayı olmadan yakabilme yetkisi verir. Bu, dTL'nin kapalı devre/düzenleyici doğasıyla tutarlı bir "ihraççı clawback" yetkisi olarak kabul edilmiş, kontrat bu amaçla değiştirilmemiştir. İlgili implementasyon: `orchestrator/src/services/pool-feeder.service.js` (`burnPool4Dtl` fonksiyonu ve dosya başı JSDoc notu).

### 5.2. Havuz 2 XLM Enjeksiyonu — Hibrit DEMO_MODE

Rapor Bölüm 5.3.1 ve 5.4 sonu, Havuz 4'ten yakılan dTL karşılığının off-chain kontrollü bir kurla XLM'e çevrilip Havuz 2'ye enjekte edildiğini tarif eder ("ihraççının kontrollü döviz/kripto dönüşüm süreciyle"). Bu off-chain adım (kur belirleme, gerçek TL↔XLM işlemi) sistemin dışındadır ve orkestrasyon katmanı tarafından otomatik olarak taklit edilemez/edilmemelidir — aksi halde testnet'te gerçek olmayan bir "1:1 karşılık" görüntüsü verir.

Bu nedenle `pool-feeder.service.js` iki modda çalışacak şekilde tasarlanmıştır (`DEMO_MODE` ortam değişkeni ile seçilir, ikisi de AYNI kod yolunu kullanır):

- **`DEMO_MODE=false` (varsayılan, gerçekçi/üretim davranışı):** Burn otomatik yapılır, ancak XLM enjeksiyonu OTOMATİK yapılmaz. `PoolFeed` kaydı `awaiting_offchain` durumunda kalıcı olarak bekler; loglarda ve kayıtta `"MANUEL ONAY BEKLENİYOR"` damgası taşınır. Gerçek off-chain dönüşüm tamamlandıktan sonra enjeksiyon ayrıca (manuel/operasyonel bir adımla) tetiklenmelidir.
- **`DEMO_MODE=true` (yalnızca TEKNOFEST canlı sunumu için):** `POOL_FEEDER_DEMO_DTL_PER_XLM` ile tanımlı sabit bir kur kullanılarak XLM enjeksiyonu OTOMATİK yapılır. Loglarda ve `PoolFeed.exchangeRateNote` alanında her zaman `"SİMÜLE KUR (DEMO_MODE)"` damgası taşınır — hangi modda çalışıldığı hiçbir kayıtta belirsiz kalmaz.

İlgili implementasyon: `orchestrator/src/services/pool-feeder.service.js` (`convertDtlToXlm`, `injectXlmToPool2` fonksiyonları), `orchestrator/src/config/index.js` (`config.demoMode`, `config.poolFeeder.demoDtlPerXlm`).

---

## 6. Bilinen Eksikler ve Demo/Production Öncesi Yapılacaklar

> Bu bölüm, `POST /transactions/submit` rotasının `wrapAndSubmitFeeBump()`'a bağlanması (Madde 3) çalışması sırasında tespit edilen, henüz kapatılmamış operasyonel/güvenlik eksiklerini belgeler. Yukarıdaki bölümler (1-5) DEĞİŞTİRİLMEMİŞTİR.

### 6.1. Kalıcı MongoDB Gerekiyor

Sistemin gerçek testnet E2E doğrulaması `mongodb-memory-server` ile yapılmıştır — bu, yalnızca test/doğrulama script'leri için süreç içinde başlatılan **geçici, bellek-içi** bir MongoDB'dir; süreç kapanınca tüm veri (idempotency kayıtları, işlem geçmişi, üye işyerleri) kaybolur. Gerçek çalışan sistem için (canlı demo günü dahil) MongoDB Atlas'ta (ücretsiz cluster yeterli) kalıcı bir veritabanı kurulup `MONGODB_URI` ortam değişkeni ile bağlanması gerekir. **Bu henüz yapılmamıştır.**

### 6.2. Rate Limiting (İstek Sıklığı Sınırı) Yok

`POST /transactions/submit` artık `authMiddleware` ile korunuyor, ancak kimliği doğrulanmış **tek bir üye işyeri**, ardışık farklı işlemlerle Havuz 2'yi işlem başına `config.feeBump.maxTotalFeeStroops` (varsayılan ~1 XLM) limitine kadar defalarca tüketebilir — hiçbir istek sıklığı sınırı (`express-rate-limit` veya benzeri bir middleware) yoktur. Mevcut kısmi korumalar: `authMiddleware` (yalnızca kayıtlı işyerleri), işlem başına mutlak ücret tavanı (`maxTotalFeeStroops`), kontrat beyaz listesi (`allowedContractIds`), iç zarf başına tek operasyon sınırı (`maxInnerOperations=1`). Bunların hiçbiri istek **sıklığını** sınırlamaz. Ayrı bir güvenlik iş paketi olarak listelenmelidir. **Bu henüz yapılmamıştır.**

### 6.3. `orchestrator/.env` Operasyonel Süreci Netleşmedi

`.env` dosyası `.gitignore`'dadır ve `POOL2_SECRET_KEY`/`ISSUER_SECRET_KEY` gibi gizli anahtarları içerir; repoda hiçbir zaman bulunmaz. Gerçek testnet işlemi gönderebilmek için bu dosyanın doldurulmuş olması gerekir. Anahtarların kimin tarafından, hangi güvenli kanaldan sağlanacağı (örn. HSM, secret manager, elle) operasyonel olarak henüz tanımlanmamıştır — bkz. Bölüm 5.1 "Yan not — ihraççı clawback yetkisi" ile aynı üretim-öncesi sertleştirme kapsamı.

