# KALEM — Mimari Kararlar ve Derleme Dokümantasyonu (ARCHITECTURE_DECISIONS.md)

> Bu belge, KALEM projesinin mimari kararlarını, derleme ortamını ve doğrulanmış test/WASM sonuçlarını içerir.
>
> **Sistemin hangi kısmının gerçek, hangi kısmının simülasyon olduğunu arıyorsanız:** bkz. [`GERCEK_VS_SIMULASYON.md`](GERCEK_VS_SIMULASYON.md) — bu belgedeki §4, §5, §6.7 ve §7.5 bulgularını tek yerde, canlı zincir doğrulamasıyla birlikte özetler.

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

### 6.1. Kalıcı MongoDB — ~~Gerekiyor~~ TAMAMLANDI

Sistemin Madde 3/5 E2E doğrulamaları `mongodb-memory-server` ile yapılmıştı — bu, yalnızca test/doğrulama script'leri için süreç içinde başlatılan **geçici, bellek-içi** bir MongoDB'dir; süreç kapanınca tüm veri kaybolur. Gerçek çalışan sistem için MongoDB Atlas'ta kalıcı bir cluster kurulup bağlanmıştır ve gerçek bir kayıtla doğrulanmıştır:

- `orchestrator/.env`'deki `MONGODB_URI` gerçek bir Atlas cluster'ına işaret ediyor. `config/index.js`'in bunu doğru okuduğu teyit edildi (kimlik bilgileri her zaman maskelenerek gösterildi, hiçbir zaman düz metin loglanmadı/commit edilmedi).
- **Tespit edilen ortam sorunu:** Bu makinede Node'un DNS çözücüsü (`dns.getServers()` → `127.0.0.1`, muhtemelen yerel bir VPN/antivirüs DNS müdahalesi) `mongodb+srv://` bağlantı dizesinin gerektirdiği SRV DNS kaydını `ECONNREFUSED` ile reddediyordu — Windows'un kendi `nslookup`'ı aynı kaydı sorunsuz çözüyordu, yani DNS kaydının kendisi değil, Node'un bu makinedeki DNS yapılandırması sorunluydu. **Çözüm:** Atlas'ın standart (SRV olmayan) `mongodb://host1,host2,host3/...` formatına geçildi — bu format SRV DNS sorgusuna hiç ihtiyaç duymadığı için bu sınıf soruna karşı kalıcı olarak daha sağlamdır, yalnızca bu makineye özel bir yama değildir.
- Sunucu (`node src/index.js`) gerçekten başlatılıp log'da `[MongoDB] Bağlantı başarılı.` ile Atlas'a bağlandığı doğrulandı; ardından SSE dinleyicisi ve pool-feeder cron'u da sorunsuz başladı.
- Gerçek bir üye işyeri kaydı (`POST /merchants/register`) çalışan sunucu üzerinden oluşturuldu; **tamamen bağımsız, yeni bir mongoose bağlantısıyla** (aynı process'in önbelleği değil) sorgulanıp kaydın gerçekten Atlas'ta kalıcı olduğu doğrulandı, ardından test kaydı temizlendi.
- **Not:** `MONGODB_URI`'de veritabanı adı belirtilmediği için bağlantı varsayılan `test` veritabanına düşüyor (`mongoose.connection.name === 'test'`) — işlevsel bir sorun değildir ama istenirse URI'nin sonuna `/kalem` eklenerek netleştirilebilir; bu operasyonel bir tercih olduğu için burada yalnızca not düşülmüştür, otomatik değiştirilmemiştir.

### 6.2. Rate Limiting (İstek Sıklığı Sınırı) — ~~🔴 DEMO ÖNCESİ MUTLAKA YAPILMALI~~ ✅ TAMAMLANDI (6 Eylül 2026)

**Öncelik yükseltildi (15 Ağustos 2026, client/ iş paketi sırasında):** `POST /transactions/submit`'in kimlik doğrulaması artık iki yolludur (bkz. §7'nin devamı / `auth.middleware.js` → `submitAuthMiddleware`) — `Authorization: Bearer <apiKey>` YOKSA istek, yalnızca `signedXdr`'ın kendi kaynak hesabı tarafından imzalandığının yerel doğrulamasıyla (`verifySignedBySource()`) kabul edilir. Bu değişiklik **doğru ve gerekliydi** (müşterinin esnafın gizli API anahtarına ihtiyaç duymadan kendi imzasıyla ödeme gönderebilmesi için tasarımın kendisi bunu gerektiriyordu), ancak koruma çemberini daralttı: eskiden bu uca yalnızca **kayıtlı bir esnaf** (KYC/KYB süreciyle `POST /merchants/register` üzerinden oluşturulmuş, kısıtlı sayıda hesap) çağrı yapabilirken, artık **geçerli, bedava üretilebilen herhangi bir Ed25519 anahtar çifti** (`StellarSdk.Keypair.random()`, kayıt/izin gerektirmez) bu uca istediği sıklıkta istek gönderebilir. `pay_merchant` çağrısı esnaf olmayan (kayıtsız) bir `from` için zaten `simulateInnerTransaction` aşamasında zincirde başarısız olur (esnaf `merchant` parametresi geçerli değilse) — **ama bu başarısızlık Havuz 2 ücreti harcanmadan ÖNCE gerçekleşmez**: `assertValidInnerTransaction` (senkron, ücretsiz) geçtikten SONRA çalışan `simulateInnerTransaction` bir Soroban RPC çağrısıdır ve bunun kendisi de ölçeklenebilir bir kaynak tüketimidir (RPC/Horizon üzerinde), sıklık sınırı olmadan sistemi DoS'a açık bırakır.

Mevcut kısmi korumalar (değişmedi): işlem başına mutlak ücret tavanı (`maxTotalFeeStroops`), kontrat beyaz listesi (`allowedContractIds`), iç zarf başına tek operasyon sınırı (`maxInnerOperations=1`), timebounds zorunluluğu. Bunların hiçbiri istek **sıklığını** sınırlamaz — ve artık bu sınırlamanın yokluğu, "kısıtlı esnaf havuzu" varsayımına değil, "kimliksiz, bedava üretilebilen anahtarlar" gerçeğine karşı savunmasız.

**Demo öncesi minimum:** `/transactions/submit`'e IP-bazlı ve/veya `signedXdr` kaynak-adresi bazlı bir `express-rate-limit` (örn. dakikada N istek) eklenmelidir — bu, mevcut `assertValidInnerTransaction`/`idempotencyMiddleware` zincirinin EN BAŞINA girmeli (Soroban RPC'ye hiç gitmeden reddetmek için). **Bu artık YAPILMIŞTIR — uygulama ayrıntıları için aşağıdaki §6.2.1'e bakınız.**

**Faucet notu (`POST /api/v1/faucet/mint`, bkz. §6.7):** Bu uçta **günlük ve/veya adres başına bir istek-sıklığı sınırı yoktur** — tek koruma, çağıranın adres sahipliğini kanıtlayan imza + 5 dakikalık `timestamp` penceresidir (yalnızca replay'i engeller, sıklığı sınırlamaz). Sahibi olunan herhangi bir adres, süresi dolmuş her `timestamp` için yeni bir imza üreterek ucu istediği sıklıkta çağırabilir ve her seferinde sabit tutarda (`FAUCET_MINT_AMOUNT_STROOPS`) gerçek bir `ISSUER_SECRET_KEY` imzalı mint işlemi tetikleyebilir. Bu, **bilinçli bir PoC kararıdır**: testnet demo para biriminin mali bir karşılığı yoktur (mainnet karşılığı da yoktur, bkz. §6.7), dolayısıyla demo/PoC kapsamında kabul edilebilir — ama Soroban RPC/Horizon üzerinde aynı sınıf kaynak-tüketimi (DoS) riskini taşır. **Demo öncesi bulut host'a taşırken**, yukarıdaki `/transactions/submit` için önerilen genel rate-limiting işiyle (bkz. bir önceki paragraf) BİRLİKTE ele alınmalıdır — ayrı bir iş kalemi değil, aynı `express-rate-limit` çalışmasının bir parçası olarak düşünülmelidir. **Bu artık YAPILMIŞTIR** — öngörüldüğü gibi ayrı bir iş kalemi olarak değil, aynı `express-rate-limit` çalışmasının parçası olarak (§6.2.1).

#### 6.2.1. Uygulama (6 Eylül 2026)

`express-rate-limit` (v8) eklendi; tüm limiter'lar tek dosyada toplandı: `orchestrator/src/api/middleware/rate-limit.middleware.js`.

**Yol boyunca bulunan ek risk — yukarıdaki analiz eksikti.** §6.2'nin ilk yazımı riski Soroban RPC tüketimine bağlıyordu. Kod yeniden izlendiğinde, kimliksiz bir isteğin RPC'ye ULAŞMADAN ÖNCE de kalıcı maliyet ürettiği görüldü:

| # | Adım | Maliyet |
| :-- | :--- | :--- |
| 1 | `validateTransactionSubmit` | CPU, ~sıfır |
| 2 | `submitAuthMiddleware` | XDR parse + Ed25519 doğrulama (CPU) |
| 3 | `idempotencyMiddleware` → `acquireIdempotencyLock()` | **MongoDB yazma** (`writeConcern: majority`) |
| 4 | `submitTransactionHandler` → `Transaction.create()` | **İkinci MongoDB yazma** |
| 5 | `wrapAndSubmitFeeBump` → `simulateInnerTransaction()` | **Soroban RPC** |
| 6 | Zarf geçerliyse `submitTransaction()` | Horizon + **gerçek Havuz 2 XLM** |

3. ve 4. adımdaki kayıtlar `failed` olarak işaretlenir ama **silinmez**. Yani sıklık sınırı olmaması yalnızca RPC/Horizon üzerinde yük değil, **Atlas depolama kotasını doldurup sistemi tamamen durdurabilecek** bir birikim riskiydi. Limitlerin `idempotencyMiddleware`'den önce girmesinin asıl gerekçesi budur.

**Yerleşim — §6.2'nin "zincirin EN BAŞINA" önerisi iki noktaya bölündü:**

```
submitIpRateLimiter          ← pozisyon 0, hiçbir parse/DB yok
validateTransactionSubmit
submitAuthMiddleware         ← req.senderAddress / req.merchantId burada set edilir
submitIdentityRateLimiter    ← İLK DB YAZMASINDAN ÖNCE
idempotencyMiddleware        ← ilk MongoDB yazması
submitTransactionHandler     ← DB + Soroban RPC + Horizon
```

Kimlik bazlı limit neden pozisyon 0'da değil: anahtarı üretmek için `signedXdr`'ın parse edilmesi gerekir ve `submitAuthMiddleware` bunu ZATEN yapar. En başa koymak aynı zarfı iki kez parse etmek olurdu — saldırganın değil kendi maliyetimizi artırırdı. Bu yerleşimde hiçbir istek, bir limitten geçmeden herhangi bir DB yazmasına veya RPC çağrısına ulaşamaz; §6.2'nin niyeti korunur.

**Neden iki katman (IP + kimlik):** IP tek başına yetmez — TEKNOFEST standında tüm cihazlar aynı NAT arkasındadır, meşru kullanıcılar birbirinin sayacını tüketirdi. Kimlik tek başına da yetmez — Stellar adresi bedava üretilir, saldırgan her istekte yeni `Keypair.random()` ile adres limitini atlar. İkisi birlikte her iki boşluğu kapatır.

**Kapsanan uçlar** (§6.2 iki uçtan bahsediyordu; grep ile iki kimliksiz uç daha bulundu ve kullanıcı onayıyla kapsama alındı):

| Uç | Anahtar | Varsayılan limit |
| :--- | :--- | :--- |
| `POST /transactions/submit` | IP | 30 / 5 dk |
| `POST /transactions/submit` | gönderen adres veya `merchantId` | 10 / dk |
| `POST /faucet/mint` | adres | 5 / saat |
| `POST /faucet/mint` | IP | 15 / saat |
| `POST /merchants/register` | IP | 10 / saat |
| `GET /transactions/:txHash/gib-document` | IP | 60 / dk |

`/merchants/register` kimlik doğrulaması olmayan ve her istekte kalıcı bir `Merchant` kaydı yazan bir uçtur — `/transactions/submit` ile aynı sınıf açıktır. GİB belge ucu yazma yapmaz; limiti yalnızca toplu kazımayı (scraping) yavaşlatmak içindir, bu yüzden daha gevşektir.

**Tüm limitler env değişkenidir** (`RATE_LIMIT_*`, bkz. `.env.example`) — amaç, sunum öncesinde kod değiştirmeden gevşetilebilmeleridir. `RATE_LIMIT_ENABLED=false` tüm limiter'ları kapatır; yalnızca yerel hata ayıklama içindir.

**429 yanıt gövdesi** kod tabanının her yerindeki şekle uyar: `{ "error": "RATE_LIMITED", "message": "Çok fazla istek gönderildi, ..." }`. Client tarafında değişiklik GEREKMEDİ — `api.service.js` zaten `payload.message`'ı `ApiError`'a taşıyor ve ekranlar bunu gösteriyor.

**Store: bellek-içi (`MemoryStore`) — bilinçli tercih ve bilinen sınırlama.** MongoDB destekli bir store her istekte bir DB yazması yapardı, yani tam olarak engellemeye çalıştığımız şeyi. Bedeli: sayaçlar sunucu restart'ında sıfırlanır ve **çok-instance'lı bir dağıtımda instance'lar arası paylaşılmaz**. Tek instance'lı demo dağıtımı için kabul edilebilir; yatay ölçeklemeye geçilirse paylaşımlı bir store (Redis vb.) gerekir.

**🔴 `trust proxy` — bulut host'a taşırken MUTLAKA yapılacak ayar.** IP bazlı katman `req.ip`'ye dayanır. `TRUST_PROXY_HOPS` env değişkeni eklendi (`src/index.js` → `app.set('trust proxy', ...)`): **yerelde `0`; Render'da ölçülen doğru değer `3`'tür — bkz. §6.2.2, ilk tahmin edilen `1` canlıda YANLIŞ çıktı**. Yanlış ayarlanırsa iki yönde de kırılır:

- **Çok düşükse** (bulut host'ta `0` kalırsa): `req.ip` HERKES için proxy'nin IP'si olur, tüm kullanıcılar tek sayacı paylaşır ve **ilk 30 istekte topluca kilitlenirler**. Uygulama sağlıklı log üretmeye devam ettiği için bu, demo günü teşhisi zor bir arıza olarak görünür.
- **`true` / çok yüksekse:** saldırgan `X-Forwarded-For` başlığını uydurarak limiti tamamen atlar.

Deploy sonrası doğrulama: iki farklı ağdan (ör. mobil veri + wifi) istek atıp `RateLimit-*` başlıklarının **ayrı ayrı** saydığı teyit edilmelidir; aynı sayaçta ilerliyorlarsa `TRUST_PROXY_HOPS` yanlıştır.

**Testler:** `orchestrator/test/rate-limit.middleware.test.js` — 8 test. Sayaç davranışı ve anahtar seçimi (farklı adreslerin/esnafların ayrı sayılması) birim testleriyle; asıl iddia ise gerçek router zinciri + gerçek (bellek-içi) MongoDB ile: **limit aşıldığında hiçbir `IdempotencyKey`/`Transaction` kaydının oluşmadığı** doğrulanır. Bu test "limiter var" değil "**limiter doğru yerde**" iddiasını kanıtlar — limiter zincirin sonunda olsaydı başarısız olurdu. Paket toplamı: **141/141 PASS** (önceki 133 + 8 yeni).

#### 6.2.2. `trust proxy` Canlıda Yanlış Çıktı — Ölçüm ve Düzeltme (10 Eylül 2026)

§6.2.1'de `TRUST_PROXY_HOPS`'un yanlış ayarlanmasının riski yazılmıştı. **Render'a ilk dağıtımda tam olarak o hata gerçekleşti** — ve ilk tahmin edilen değer (`1`) de yanlıştı. Bu bölüm, hatanın nasıl yakalandığını ve doğru değerin nasıl ölçüldüğünü belgeler.

**Nasıl yakalandı:** `/health` `trustProxyHops: 1` raporluyordu, yani ayar "doğru görünüyordu". Ancak ayarın DEĞERİNİ bilmek, doğru ÇALIŞTIĞINI kanıtlamaz. XFF göndermeden, IPv4'e sabitlenmiş 15 hızlı istekte dönen `RateLimit-Remaining` değerleri **üç bağımsız sayaca** ayrıştı:

```
A: 59 58 57 56 55 54     B: 59 58 57 56 55     C: 59 58 57 56
```

15 isteğin tamamı hesapta, her dizi kusursuz birer birer düşüyor. Tek instance olduğu ayrıca doğrulandı (10 istekte `sseListener.startedAt` aynı), istemci IP'si de sabitti — yani sapma Express'in XFF zincirinden hangi elemanı seçtiğindeydi.

**Ölçüm:** `/health`'e proxy teşhis bloğu eklenip yeniden dağıtıldı. Zincirin gerçek şekli:

```
X-Forwarded-For: 88.253.38.157, 104.23.180.102, 10.25.111.8
                    ↑ gerçek istemci   ↑ Cloudflare    ↑ Render iç ağı
socketRemoteAddress: ::1
```

**Kritik ayrıntı:** Express hop sayarken **soket bağlantısını da bir hop sayar**. Render'ın iç proxy'si uygulamaya loopback (`::1`) üzerinden bağlandığı için gerçek hop dizilimi şudur:

| Hop | Adres | Nedir |
| :-- | :--- | :--- |
| 0 | `::1` | Render iç proxy'sinin soket bağlantısı |
| 1 | `10.25.111.8` | Render iç yük dengeleyici |
| 2 | `104.23.180.102` | Cloudflare edge |
| 3 | `88.253.38.157` | **GERÇEK İSTEMCİ** |

`TRUST_PROXY_HOPS=1` iken `req.ip` = `10.25.111.8` çözülüyordu — **Render'ın iç yük dengeleyicisi**. Bu adres TÜM kullanıcılarda ortaktır ve istekten isteğe dönüşümlüdür (`10.25.111.8`, `10.24.213.77`, …). Sonuç: limitler "IP başına" değil **fiilen küresel** sayıyordu; birkaç kullanıcı diğer herkesi kilitleyebilirdi. Tek kullanıcı test ettiği için arıza gizli kalmıştı.

**Spoofing sorusu da cevaplandı:** sahte `X-Forwarded-For: 1.2.3.4` gönderildiğinde ham başlık `1.2.3.4,88.253.38.157, 104.23.…` oldu — yani altyapı başlığı **ezmiyor, üstüne ekliyor**. Bu nedenle `trust proxy: true` (en soldakine güvenmek) durumu **daha kötü** hale getirirdi: herkes limiti tek bir başlıkla atlardı.

**Doğru değer 3.** Saldırganın enjekte ettiği her girdi zincirin SOLUNA düştüğü ve altyapı gerçek istemcinin sağına sabit sayıda hop eklediği için, `3` hem doğru istemciyi verir hem spoof'a kapalıdır.

| Değer | `req.ip` | Sonuç |
| :--- | :--- | :--- |
| `1` | `10.25.111.8` | 🔴 Render iç adresi — limitler küresel sayar |
| `2` | `104.23.180.102` | 🔴 Cloudflare edge — o da paylaşımlı, aynı sınıf hata |
| `true` | `1.2.3.4` (uydurma) | 🔴 limit tek başlıkla atlanır |
| **`3`** | `88.253.38.157` | ✅ gerçek istemci, spoof'a kapalı |

**Bir daha sessizce bozulmaması için eklenenler:**

1. **Otomatik tespit** (`utils/net.js` → `isPrivateOrLoopbackIp`): rate limit anahtarı özel/loopback bir adrese çözülüyorsa bu neredeyse kesin yanlış yapılandırmadır (gerçek bir istemci internet üzerinden özel adresle gelemez). `/health` bunu `proxy.looksMisconfigured: true` ve yol gösterici bir `hint` ile raporlar.
2. **Süreç başına bir kez uyarı logu** (`rate-limit.middleware.js`): anahtar özel bir adrese çözülürse `[RateLimit] UYARI: ...` loglanır.
3. **Regresyon testleri** (`test/health.routes.test.js`): gerçek ölçülen zincir şekliyle, `3`'ün gerçek istemciyi, `1`'in ise iç adresi seçtiği donduruldu. Biri değeri geri alırsa test neyin bozulduğunu açıkça gösterir.

**Ders:** Bir ayarın değerini raporlamak, doğru çalıştığını kanıtlamaz. `trust proxy` gibi altyapıya bağlı ayarlar **canlı ortamda ölçülerek** doğrulanmalıdır; hop sayısı platforma özgüdür ve tahmin edilemez.

### 6.3. `orchestrator/.env` Operasyonel Süreci Netleşmedi

`.env` dosyası `.gitignore`'dadır ve `POOL2_SECRET_KEY`/`ISSUER_SECRET_KEY` gibi gizli anahtarları içerir; repoda hiçbir zaman bulunmaz. Gerçek testnet işlemi gönderebilmek için bu dosyanın doldurulmuş olması gerekir. Anahtarların kimin tarafından, hangi güvenli kanaldan sağlanacağı (örn. HSM, secret manager, elle) operasyonel olarak henüz tanımlanmamıştır — bkz. Bölüm 5.1 "Yan not — ihraççı clawback yetkisi" ile aynı üretim-öncesi sertleştirme kapsamı.

### 6.4. SSE Dinleyicisinde Kalıcı Cursor / Reconciliation — ~~Yok~~ ✅ MUTABAKAT EKLENDİ (13 Eylül 2026)

Madde 5 (`sse-listener.service.js` havuz filtresi düzeltmesi) sırasında incelenmiştir. `@stellar/stellar-sdk`'in `stream()` implementasyonu (`horizon/call_builder.js`) kısa süreli ağ kesintilerine karşı makul bir koruma sağlar: her mesajda sıfırlanan 15 saniyelik bir durgunluk (staleness) sayacı bağlantıyı otomatik kapatıp yeniden açar, alttaki `EventSource` de kendi native retry'ını çalıştırır, ve son işlenen `paging_token` bellekte tutulup yeniden bağlanırken kullanılır — yani saniyeler-dakikalar süren kesintilerde veri kaybı olmaz.

**Ancak iki gerçek boşluk var:**
- **Sabit 15sn retry aralığı, exponential backoff yoktur** — uzun süreli bir Horizon kesintisinde sistem aralıksız denemeye devam eder, hız kesme/geri çekilme mantığı yoktur.
- **Kalıcı cursor yoktur (asıl önemli olan bu):** `startSSEListener()` her çağrıldığında `.cursor('now')` ile sıfırdan başlar; cursor hiçbir yerde (DB'de) saklanmaz. Orkestrasyon süreci yeniden başlarsa (deploy, crash, restart) — o pencerede zincire yazılan ama henüz yakalanmamış bir onay **kalıcı olarak kaçırılır**. Hiçbir reconciliation/backfill job'ı `'submitted'` durumunda takılı kalan işlemleri sonradan Horizon'dan sorgulayıp düzeltmiyor; `/health` endpoint'i de SSE bağlantı durumunu yansıtmıyor — dolayısıyla bu durum operasyonel olarak fark edilmeyebilir.

**Öneri (üretim öncesi yapılmalı, bu iş paketinin kapsamı dışında bırakıldı):** son işlenen cursor'ı MongoDB'de kalıcı tutmak, sunucu başlangıcında oradan devam etmek; ayrıca periyodik bir reconciliation job'ı ile belirli bir süreden uzun `'submitted'` durumunda kalan işlemleri Horizon'dan tekil sorgulayıp durumlarını düzeltmek (SSE'nin bir yedeği olarak).

**Durum güncellemesi (13 Eylül 2026):** Önerinin **ikinci yarısı (reconciliation job) UYGULANDI** — bkz. §6.4.1. Kalıcı cursor hâlâ yoktur, ancak mutabakat job'ı onun çözdüğü sorunu (kaçan onay) pratikte kapattığı için öncelik düşmüştür.

#### 6.4.1. Mutabakat Job'ı — Gerçek Bir Arızayla Gerekliliği Kanıtlandı (arıza: 12 Eylül 2026)

§6.4 bu açığı teorik bir risk olarak yazmıştı. Render'daki canlı dağıtımda yapılan **uçtan uca gerçek provada risk gerçekleşti.**

**Gözlem:** Müşteri→esnaf ödemesi zincire başarıyla yazıldı — tx [`b5466573…`](https://stellar.expert/explorer/testnet/tx/b5466573a0233c4d2c8df82f783e11d3a844bf1c24ea1a2c708abd7ea39983d9) (ledger `4628674`, zincir zaman damgası **11 Eylül 2026 22:49:17 UTC = 12 Eylül 2026 01:49 TSİ**), Havuz 2 ücreti ödedi, esnaf tam `2.4900000` dTL (%99,6) aldı. **Ancak GİB belgesi hiç üretilmedi.** `/health` şunu gösteriyordu:

```
sseListener: { started: true, messageCount: 0, lastMessageAt: null, lastError: null }
```

Yani dinleyici "başlatıldı" görünüyor, hata da yok, ama **hiç mesaj almamış**. Bu, §6.4'ün öngördüğü sessiz arızanın ta kendisidir; `/health`'e `messageCount` alanı eklenmiş olmasaydı teşhis edilemezdi (uygulama dışarıdan tamamen sağlıklı görünüyordu).

**Kodun suçsuz olduğu kanıtlandı:** Aynı SDK, aynı `forAccount(Havuz2)` filtresi ve aynı Horizon ile YEREL bir testte akış sorunsuz çalıştı ve **tam da bu ödeme tx'ini yakaladı** (`cursor('0')` ile geçmiş oynatıldığında 11 mesaj, ödeme dahil). Dolayısıyla sorun kodda veya filtrede değil, dağıtım ortamındadır.

**Alınan karar — SSE'yi Render'da kovalamak yerine yedek eklemek:** SSE düzelse bile tek bir ağ akışına bağımlılık kırılgandır; ayrıca ücretsiz planda süreç uykuya geçip yeniden başladığında `.cursor('now')` sıfırdan başlar ve o penceredeki onaylar zaten kalıcı olarak kaybolur. Bu nedenle `orchestrator/src/services/reconciliation.service.js` eklendi:

- Periyodik olarak (varsayılan: dakikada bir, `RECONCILIATION_CRON`) `submitted` durumunda **ve belirli bir yaştan eski** işlemleri bulur.
- Her biri için Horizon'a **tekil** sorgu atar.
- Zincirde başarılıysa **`handleTransaction()`'ı çağırır** — onay, GİB üretimi ve bildirim mantığı SSE yolundakiyle BİREBİR AYNI kod yolundan geçer, kopyalanmaz.
- Zincirde bulunamayan (404) işlem `submitted` bırakılır (henüz onaylanmamış olabilir); zincirde başarısız olan `failed` yapılır, aksi halde sonsuza kadar sorgulanırdı.
- Çok taze işlemler atlanır: normal akışta önce SSE'ye şans verilir, gereksiz Horizon sorgusu yapılmaz.

**Doğrulama:** Job, kaybolan gerçek ödeme üzerinde çalıştırıldı — işlem `confirmed` oldu, `ledgerNumber` yazıldı ve **GİB belgesi üretildi** (`status: generated`, canlı backend'den doğrulandı).

**Yol boyunca bulunan bug:** Horizon SDK yanıtında `tx.ledger` bir **fonksiyondur** (ilgili ledger'ı çeken link takipçisi), sayı değil; ledger numarası `ledger_attr`'dadır. İlk implementasyon `tx.ledger`'ı önce okuduğu için Mongoose `Cast to Number failed` hatası veriyor ve hiçbir işlem mutabakattan geçemiyordu. Düzeltildi ve bu tuzak için ayrı bir regresyon testi yazıldı.

**Testler:** `orchestrator/test/reconciliation.service.test.js` — 7 test (onay+GİB üretimi, `ledger` fonksiyonu tuzağı, 404 davranışı, başarısız işlem, taze işlem atlama, confirmed'a dokunmama, Horizon yapılandırılmamış). Paket toplamı: **167/167 PASS**.

---

### 6.6. CORS Eklendi — client/ iş paketi sırasında GERÇEK tarayıcıda bulundu

Esnaf giriş ekranı gerçek testnet backend'ine (yerel `node src/index.js`, gerçek Atlas MongoDB) karşı test edilirken tespit edildi: orchestrator hiçbir CORS header'ı göndermiyordu — `curl` ile `GET /api/v1/health` mükemmel çalışırken, tarayıcıdan (client `localhost:19010`, backend `localhost:3000` — farklı origin) aynı istek `TypeError: Failed to fetch` ile başarısız oluyordu. Bu yalnızca esnaf girişini değil, **müşteri tarafındaki `POST /transactions/submit`'i de (web hedefinde)** etkiliyordu.

**Çözüm (`src/index.js`, `src/config/index.js`):** `cors` paketi eklendi. Herhangi bir `localhost`/`127.0.0.1` portuna (hangi port olursa olsun — Expo web dev sunucusu her başlatmada farklı porta düşebilir) DAİMA izin verilir; ayrıca `CORS_ALLOWED_ORIGINS` env değişkeninde (virgülle ayrılmış, tam origin) listelenen sabit origin'lere de izin verilir. **Prod/demo sunucu adresi netleşince** (bulut host'a taşırken) gerçek client origin'i `CORS_ALLOWED_ORIGINS`'e eklenmelidir — şu an boştur, yalnızca localhost deseni aktiftir.

### 6.7. Demo Musluk (Faucet) — `POST /api/v1/faucet/mint` — YALNIZCA testnet

client/ iş paketinde "Bakiye Yükle" akışını yazarken tespit edildi: yeni bir müşteri cüzdanına yalnızca `dtl-token.mint()` çağırmak YETMEZ — cüzdanın Stellar **classic** ledger'da bir hesap olarak var olması (fonlanmış olması) da gerekir, aksi halde `createPaymentTransaction`'daki `horizonServer.loadAccount()` çağrısı gerçek testnet'te doğrulanan şekilde `404 Not Found` ile başarısız olur (Soroban kontrat storage'ındaki bir bakiye kaydı, classic ledger hesabı VAR ANLAMINA GELMEZ). "Bakiye Yükle" bu yüzden İKİ adımı birleştirir:

1. **Testnet Friendbot ile hesap fonlama** (`client/src/services/stellar-read.service.js` → `fundViaFriendbot()`): doğrudan `https://friendbot.stellar.org?addr=...`'a client'tan çağrı — backend'e hiç uğramaz, kimlik doğrulama gerektirmez. **Friendbot yalnızca testnet'te vardır — mainnet'te KARŞILIĞI YOKTUR.** Gerçek/mainnet dağıtımında hesap fonlama, kullanıcının kendi XLM'ini yatırması veya bir sponsorlu hesap oluşturma (sponsored reserve) akışıyla çözülmelidir; bu adımın TAMAMEN kaldırılıp yerine gerçek bir account-funding stratejisi konması gerekir.
2. **Demo mint** (`POST /api/v1/faucet/mint`, `orchestrator/src/services/faucet.service.js` + `api/routes/faucet.routes.js`): esnaf kaydındaki `buildMerchantOwnershipChallenge` ile AYNI desen — çağıran, `KALEM-FAUCET-MINT:{address}:{timestamp}` mesajını kendi cüzdan anahtarıyla imzalayarak adres sahipliğini kanıtlar (Bearer API key gerekmez, müşterinin öyle bir anahtarı yok). Sunucu bu imzayı doğruladıktan sonra `ISSUER_SECRET_KEY` ile **sabit** bir tutar (`FAUCET_MINT_AMOUNT_STROOPS`, varsayılan 10 dTL) mint eder — **tutar client'tan asla okunmaz**, aksi halde demo musluğu sınırsız bir para basma ucuna dönerdi. `timestamp` alanı 5 dakikalık bir pencereyle sınırlanarak imzanın süresiz yeniden oynatılması (replay) engellenir.

**Gerçek hayat karşılığı:** Bu adım, gerçek bir dağıtımda lisanslı bir ödeme kuruluşunun (PSP) tahsilat/para yatırma işlemi sonrası tetikleyeceği bir "hesaba dTL ekleme" işleminin YERİNİ TUTAR — burada müşteri kendi kendine, hiçbir gerçek para hareketi olmadan mint talep edebiliyor, ki bu yalnızca demo/testnet kapsamında kabul edilebilir. **`POST /api/v1/faucet/mint` route'u mainnet dağıtımında TAMAMEN kaldırılmalıdır** — `config.stellar.network !== 'testnet'` çalışma zamanı kontrolü bir güvenlik ağıdır, tek başına yeterli bir üretim kontrolü DEĞİLDİR.

### 6.5. Client (Web): Müşteri Gizli Anahtarı `localStorage`'da — Şifrelenmemiş

`client/src/services/wallet.service.js`, müşteri cüzdanının Ed25519 gizli anahtarını native'de (iOS/Android) gerçek `expo-secure-store`'da (Keychain/Keystore, donanım destekli) saklar. Web hedefinde ise `expo-secure-store`'un kurulu sürümünün web implementasyonu HİÇ YOKTUR (çağrıldığında `getValueWithKeyAsync is not a function` ile patlıyor — gerçek tarayıcıda test edilerek doğrulandı, varsayılan bir localStorage shim'i YOKTUR) — bu yüzden web'de düz `window.localStorage`'a düşen bir platform şimi eklendi. Bu, anahtarın web'de **şifrelenmemiş** ve aynı origin'deki herhangi bir XSS/zararlı script tarafından okunabilir şekilde saklandığı anlamına gelir.

Testnet/demo kapsamı için kabul edilebilir (kaybedilecek gerçek para yok, TEKNOFEST sunumu tek-oturumluk bir cihazda çalışır). **Gerçek/mainnet dağıtımında bu MUTLAKA değiştirilmelidir** — olası yönler: WebAuthn/passkey ile donanım destekli anahtar saklama, tarayıcı uzantısı tabanlı cüzdan (Freighter benzeri) entegrasyonu, ya da web hedefinin tamamen kaldırılıp yalnızca native (gerçek Secure Enclave/Keystore) dağıtımına geçilmesi. **Bu henüz yapılmamıştır.**

---

## 7. Müşteri→Esnaf Gerçek Ödeme (`pay_merchant`) ve Rapor 5.2 Sapması

> Bu bölüm, `dtl-token.transfer()`'ın P2P blokaj kapsamının genişletilmesini belgeler: müşteriden (kayıtlı olması gerekmeyen, zincirde hiç ayrıca tanımlanmayan herhangi bir gönderen) kayıtlı bir esnafa gerçek, atomik ve vergi/komisyon kesintili dTL ödemesi artık mümkündür. **v1 Bölüm 1-6 DEĞİŞTİRİLMEMİŞTİR** — bu, kullanıcı onaylı, bilinçli bir sonraki-nesil (v2) mimari karardır.

### Rapor ne diyordu

Rapor Bölüm 5.2: dTL'nin "ödeme aracı olarak [P2P] kullanımını kriptografik olarak imkânsız kılar" — yani dTL'nin yalnızca havuzlar arası (esnaf→sistem) hareket edebileceği, müşteriden esnafa doğrudan bir zincir-üstü ödemenin asla var olmayacağı ima edilir.

### Kod gerçekte ne yapıyor (v2)

Proje bir ödeme sistemi olduğu için ödeyen tarafın **gerçekten zincir üzerinde ödeme yapması**, konseptin teknik kanıtı için gerekli görüldü. Bu nedenle `transfer()`'ın alıcı kısıtlaması genişletildi (kayıtlı 4 havuza EK olarak kayıtlı esnaf adresleri de kabul edilir), ancak ikincil piyasa/P2P spekülasyon riski şu üç kuralla KAPALI tutuldu:
- Esnaf **asla gönderen olamaz** (koşulsuz guard, `transfer()`'ın en başında — `MerchantCannotSend`, #8).
- Müşteriden müşteriye veya kayıtsız/anonim herhangi bir adrese transfer **hâlâ reddedilir** (`UnauthorizedRecipient`, #2, genişletilmiş koşulla).
- Vergi/komisyon kesintisi (Havuz 3/0.1%, Havuz 4/0.3%) gerçek satışlarda da **atlanmaz** — çıplak `transfer()` yerine `pool-manager.pay_merchant()` zorunlu kılındı (aşağıya bakınız).

### Neden bu şekilde karar verildi

Değerlendirme sürecinde (kod incelemesiyle) şu kritik bulgu ortaya çıktı: çıplak `transfer()` genişletmesi (yalnızca alıcı kısıtını gevşetmek) esnafın tutarın **%100'ünü** almasına, Havuz 3/4 vergi kesintisinin **hiç olmamasına** yol açardı — sistemin ekonomik temeli (her işlemden vergi/komisyon toplanması) sessizce kırılırdı. Bu KABUL EDİLMEDİ. Bunun yerine `pool-manager.pay_merchant(from, merchant, total_amount)` eklendi — `distribute()` ile birebir aynı atomik desen, `kalem-shared::calculate_distribution()` DEĞİŞTİRİLMEDEN reuse edilerek (ilk dönüş değeri "esnaf payı" olarak yorumlanır): esnaf %99.6, Havuz 3 %0.1, Havuz 4 %0.3. Müşteri kimliği zincirde HİÇBİR ZAMAN ayrıca kaydedilmez — yalnızca "gönderen kayıtlı esnaf mı" kontrol edilir (havuz/esnaf olmayan her gönderen örtük olarak müşteri sayılır); bu, çift-rol kaydı ve sahte GİB belge üretimi gibi riskleri, ek güvenlik sağlamadan davet edeceği için bilinçli olarak tercih edilmedi.

Esnaf adresleri artık gerçek para alabildiği için, kim esnaf ilan edilebileceği de sıkılaştırıldı: `POST /merchants/register` artık on-chain `register_merchant()`'ı OTOMATİK TETİKLEMEZ — (a) kayıt sırasında istemci `stellarAddress`'in özel anahtarıyla bir mesaj imzalayarak adres sahipliğini kanıtlamak zorundadır, (b) on-chain kayıt yalnızca ayrı, admin onaylı bir CLI script (`approve-merchant.mjs`) ile yapılır (bkz. §7.4).

### §7.1. v1 Kontratları (korunmuş kanıt)

**DEĞİŞTİRİLMEMİŞ, SİLİNMEMİŞ.** v1 WASM hash'leri, contract ID'leri ve 31 birim test sonucu (§3, §4) geçerliliğini korur:
- `dtl-token` v1: `CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4` (WASM: `c1ad6c61e0047da8967265b45a4527fdbd5782451b072e6aa45f6507e0e82cc6`)
- `pool-manager` v1: `CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF` (WASM: `115f8a4d46a2cbd4e6048dcd4a1f366e19d7add74fecaac88220099ea0762bb8`)

Bu kontratlar testnet'te hâlâ canlıdır ve v1'de belgelenen davranışı sergilemeye devam eder — yalnızca orkestrasyon katmanı artık onlara değil v2'ye bağlıdır (bkz. `.env`).

### §7.2. v2 Kontratları

**Redeploy zorunluydu** — `dtl-token`'da bir upgrade/self-update hook yoktur (`lib.rs` incelenerek doğrulandı), dolayısıyla `transfer()`'ın mantığını değiştirmek yeni bir WASM derlemesi ve yeni bir `stellar contract deploy` gerektirdi (yeni contract ID kaçınılmazdır). Tam deploy komutları, WASM hash'leri, tx linkleri: `docs/TESTNET_DEPLOYMENT.md` **"Mimari v2"** bölümü.

- `dtl-token` v2: `CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO`
- `pool-manager` v2: `CDR7WMMQLINNIC2PCSWUU27FHUWWLZPHBJU7MQK5EZVOJBIWQA47LQSA`
- Havuz 1/2/3/4 adresleri, `POOL2_SECRET_KEY`, `ISSUER_SECRET_KEY` DEĞİŞMEDİ.

### §7.3. Kontrat Değişiklikleri (Teknik Özet)

**`dtl-token`:**
- Yeni persistent-storage kaydı: `DataKey::MerchantFlag(Address)` (`Balance(Address)` ile aynı desen — existence-as-membership, TTL `Balance` ile aynı politikayla yenilenir).
- Yeni admin-only fonksiyon `register_merchant(merchant)` — `mint`/`burn` ile birebir aynı yetki deseni (`auth::require_admin`). Zaten kayıtlı bir esnafı veya bir havuz adresini tekrar kaydetmeye çalışmak `AlreadyRegisteredMerchant` (#9) ile reddedilir.
- Yeni view fonksiyon `is_merchant(address) -> bool`.
- `transfer()`'ın yeni sırası: (1) `from.require_auth()` (2) **koşulsuz** — `from` kayıtlı esnafsa `MerchantCannotSend` (#8) (3) tutar doğrulaması (4) alıcı kontrolü — `is_authorized_recipient(to) || is_merchant(to)` değilse `UnauthorizedRecipient` (#2) (5) bakiye taşıma.

**`pool-manager`:**
- Yeni fonksiyon `pay_merchant(from, merchant, total_amount)` — `distribute()`'un birebir aynı atomik iskeleti (`from.require_auth()`, tutar doğrulaması, 3× cross-contract `dtl-token.transfer()`), tek fark hedeflerden birinin Havuz 1 yerine `merchant` parametresi olması. `PoolConfig`/`pool_config.rs` DEĞİŞMEDİ (`pool3_address`/`pool4_address` zaten mevcuttu).
- dtl-token'ın `transfer()`'ı `merchant`'ın kayıtlı esnaf olduğunu (ve `from`'un esnaf OLMADIĞINI) zaten doğrulayacaktır — `distribute()`'un dosya başı dokümantasyonunda zaten övülen "çift katmanlı güvenlik" deseni aynen uygulanmış olur.

**Rust birim testleri:** 31 → 38 (dtl-token 19→25, pool-manager 6→7, kalem-shared 6→6 değişmedi). Tümü PASS.

**Orkestrasyon tarafında sıfır-değişiklik gerektiren noktalar (kod incelemesiyle doğrulandı):** `kalem-shared::calculate_distribution()`, `submitTransactionHandler` (`transaction.routes.js`), `assertValidInnerTransaction` (`fee-bump.service.js`), `sse-listener.service.js` — hiçbiri hangi kontrat FONKSİYONUNUN çağrıldığını sorgulamadığı için `pay_merchant`'ı hiçbir kod değişikliği olmadan otomatik olarak destekler. `merchant.routes.js`'teki `GET /:id/balance` (`readContractBalance(dtlTokenId, merchant.stellarAddress)`) daha önce "esnaf adresleri asla on-chain bakiye tutamayacağı için her zaman 0 döner" olarak işaretlenmiş bir mimari boşluktu — bu değişiklikle o boşluk KENDİLİĞİNDEN ÇÖZÜLDÜ, esnaf adresleri artık gerçek bakiye tutar.

### §7.4. Esnaf Kayıt/Onay Süreci (Güvenlik)

Değerlendirme sırasında tespit edilen açık: `POST /merchants/register` hiçbir doğrulama olmadan anında "esnaf" statüsü veriyordu (`isActive:true` varsayılan, `kycStatus:'pending'` hiçbir yeri gate'lemiyordu). Esnaf adresleri artık gerçek dTL alabildiği için bu, kim esnaf ilan edilebileceğinin anlık/kendinden-servis bir REST çağrısına bırakılamayacağı anlamına gelir. İki katmanlı çözüm:

1. **Adres sahipliği kanıtı (kayıt anında, `merchant.routes.js`):** İstemci `KALEM-MERCHANT-REGISTER:{taxId}:{stellarAddress}` mesajını `stellarAddress`'in özel anahtarıyla imzalar (`utils/crypto.js` → `buildMerchantOwnershipChallenge`), `signature` (base64) ile birlikte gönderir. Sunucu, `fee-bump.service.js`'in `assertValidInnerTransaction`'ında zaten kullanılan AYNI doğrulama birincilini (`Keypair.fromPublicKey(...).verify(...)`) tekrar kullanarak imzayı doğrular. Başarısızsa `403 OWNERSHIP_PROOF_FAILED`. Başarılıysa `Merchant.ownershipVerified = true` — ama on-chain kayıt YAPILMAZ. Durumsuz (stateless) tasarım: sunucuda ayrı bir nonce saklanmaz, replay zaten mevcut `taxId`/`stellarAddress` unique kısıtıyla engellenir.
2. **Admin onaylı on-chain kayıt (ayrı adım, `orchestrator/scripts/approve-merchant.mjs`):** `ISSUER_SECRET_KEY`'e sahip bir operatör CLI'ı elle çalıştırır (`--taxId=... --operator="..."`). Script: (a) `ownershipVerified !== true` ise KESİNLİKLE reddeder, (b) MongoDB bayrağına değil GERÇEK on-chain duruma bakar (`is_merchant()` simülasyonu) ve zaten kayıtlıysa idempotent şekilde çıkar (ikinci tx göndermez), (c) her denemeyi (başarılı/başarısız/zaten-kayıtlı) `MerchantApproval` koleksiyonuna kim/ne zaman/hangi esnaf/hangi sonuç olarak denetim kaydı yazar, (d) başarılı olursa `register_merchant()`'ı admin imzasıyla (Fee-Bump YOK — mint/burn gibi doğrudan operasyonel bir işlem) gönderir ve `Merchant.kycStatus='verified'`, `onChainRegistered=true` yapar.

**Bilinçli kapsam kararı:** Yeni bir admin-auth/RBAC alt sistemi İCAT EDİLMEDİ — CLI script'in kendisi (ve onu çalıştırabilmek için gereken `ISSUER_SECRET_KEY` erişimi) yetkilendirme sınırıdır. Bu, mevcut mint/burn/pool-feeder operasyonel deseniyle tutarlıdır.

### §7.5. Gerçek Testnet E2E Doğrulaması (15 Ağustos 2026)

Geçici script (`orchestrator/tmp-verify-paymerchant.mjs`, doğrulama sonrası **silinmiştir**) ile gerçek testnet üzerinde uçtan uca akış:

1. Test esnafı gerçek bir Ed25519 imzasıyla kaydedildi (`ownershipVerified:true`).
2. `approve-merchant.mjs` çalıştırıldı → gerçek `register_merchant` tx:
   [`f1f835db78582bd45a819a26c1da56cf4cbe65c90e5fc225a0f3e7bbf44d6d6f`](https://stellar.expert/explorer/testnet/tx/f1f835db78582bd45a819a26c1da56cf4cbe65c90e5fc225a0f3e7bbf44d6d6f)
3. AYNI script AYNI esnaf için TEKRAR çalıştırıldı → `already_registered`, **ikinci bir tx GÖNDERİLMEDİ** (idempotent davranış kanıtlandı — gerçek on-chain `is_merchant()` sorgusuyla).
4. Müşteriye (fresh, Friendbot ile fonlanmış bir keypair) 1 dTL mint edildi:
   [`f04aab520abb4a34dd94a762b8f87f505b3d6e56d01067cc2492e8b16951cc94`](https://stellar.expert/explorer/testnet/tx/f04aab520abb4a34dd94a762b8f87f505b3d6e56d01067cc2492e8b16951cc94)
5. `pay_merchant` iç zarfı müşteri tarafından imzalanıp **mevcut `/transactions/submit` ucuna, kod değişikliği olmadan** gönderildi → gerçek Fee-Bump ile ağa iletildi:
   [`ba2c5df490ceec1dfa7d82253e83887c676c8b2c8523f98978206f6e7b041061`](https://stellar.expert/explorer/testnet/tx/ba2c5df490ceec1dfa7d82253e83887c676c8b2c8523f98978206f6e7b041061)

**Bakiye doğrulaması** (gerçek Horizon/Soroban sorgusu, `readContractBalance`):

| Hesap | Beklenen Oran | Beklenen Tutar (stroops) | Gerçekleşen Bakiye | Durum |
| :--- | :--- | :--- | :--- | :--- |
| **Esnaf** | %99.6 | 9.960.000 | `9960000` | ✅ Doğrulandı |
| **Havuz 3 (Sosyal)** | %0.1 | 10.000 | `10000` | ✅ Doğrulandı |
| **Havuz 4 (Operasyonel)** | %0.3 | 30.000 | `30000` | ✅ Doğrulandı |
| **Havuz 2 (gerçek fee-bump ücreti)** | — | — | `9998.7965847 → 9998.7746024` (fark: `0.0219823` XLM) | ✅ Doğrulandı |

**Negatif kanıt (esnaf gönderemez) — GERÇEK ağ, GERÇEK deploy edilmiş v2 kontrat, tx hash YOK:**

Yukarıdaki akışta on-chain kaydedilen ve gerçek `9960000` stroops bakiyeye sahip esnaf hesabı (`GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B`), bu bakiyenin bir kısmını Havuz 1'e (`GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM`) göndermeye çalıştı:

```
stellar contract invoke \
  --id CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO \
  --source-account <esnafın gerçek secret key'i> \
  --network testnet --send=yes \
  -- transfer \
  --from GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B \
  --to GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM \
  --amount 1000000
```

Tam çıktı:
```
❌ error: transaction simulation failed: HostError: Error(Contract, #8)

Event log (newest first):
   0: [Diagnostic Event] contract:CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO, topics:[error, Error(Contract, #8)], data:"escalating error to VM trap from failed host function call: fail_with_error"
   1: [Diagnostic Event] contract:CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO, topics:[error, Error(Contract, #8)], data:["failing with contract error", 8]
   2: [Diagnostic Event] topics:[fn_call, CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO, transfer], data:[GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B, GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM, 1000000]
```

`Error(Contract, #8)` = `TokenError::MerchantCannotSend` — beklenen ve doğru davranış, gerçek ağda gerçek esnaf bakiyesiyle doğrulandı.

**Neden bir tx hash YOK (diğer 3 kanıttan farklı olarak):** Soroban'ın mimarisi, her işlemi ağa göndermeden önce salt-okunur bir `simulateTransaction` adımından geçirir (`prepareTransaction` — bkz. `stellar-tx.service.js`, `buildContractCall`). Bir host fonksiyonu (burada `transfer()`) simülasyon sırasında panic ederse, simülasyon `başarısız` olarak işaretlenir ve işlem **hiçbir zaman Horizon'a gönderilmez** — dolayısıyla ledger'a hiç yazılmaz ve bir tx hash asla üretilmez. Bu, kasıtlı bir Soroban tasarım kararıdır (kullanıcıyı, baştan başarısız olacağı belli bir işlem için ücret ödemekten korur) — `fee-bump.service.js`'in kendi dosya başı dokümantasyonu da AYNI davranışı bir güvenlik özelliği olarak zaten övmektedir ("başarısız/geçersiz bir kontrat çağrısı bu adımda elenir; Havuz 2'nin XLM'i hiç harcanmaz"). Kod tabanındaki HER yol (CLI, `buildContractCall`, Fee-Bump) aynı simüle-sonra-gönder deseni kullandığı için, bu üç kanıtla (register_merchant, mint, pay_merchant) aynı formatta bir "başarısız tx hash" üretmenin tek yolu, simülasyonu bilerek atlayıp ham/tahmine dayalı bir zarf göndermektir — bu, kod tabanının geri kalanıyla tutarsız, kırılgan bir teknik olacağından kullanılmamıştır. Deterministik, testnet'ten bağımsız kanıt için bkz. Rust birim testi `test_transfer_merchant_cannot_send_panics` (`dtl-token/src/test.rs`).

**Doğrulama script'i** (`orchestrator/tmp-verify-paymerchant.mjs`, geçiciydi) çalıştırma sonrası **silinmiştir**.

---

## 8. Devam Noktası (son güncelleme: 20 Eylül 2026 akşam — Render işleri bitti, Faz 0-3 commit'lendi (henüz push edilmedi); bkz. §8.2 en üst)

> Bu bölüm, bir sonraki oturumun sıfırdan bağlam toplamadan devam edebilmesi içindir. **En güncel durum için §8.2'nin EN ÜSTÜNDEKİ "OTURUM KAPANIŞ DURUMU" bloğunu oku.**
>
> **Tek cümlelik durum (14 Eylül 2026):** Backend Render'da canlı ve doğrulanmış (<https://kalem-5i08.onrender.com>), rate limiting canlıda ölçümle düzeltilip kanıtlandı, SSE için mutabakat yedeği eklendi ve uçtan uca ödeme provası gerçek testnet'te baştan sona geçti. **Kalan tek iş paketi: sunum senaryosu (§8 adım 4) — henüz BAŞLANMADI.** Bilinen tek açık doğrulama: QR okuma gerçek telefon kamerasıyla test edilmedi (bkz. "Bilinen açık nokta").

### 8.2. Oturum durumu (bir sonraki oturum İLK ÖNCE bunu okusun)

#### 🟢 20 EYLÜL 2026 AKŞAM GÜNCELLEMESİ (bu blok yukarıdaki kapanış bloğunun ÜSTÜNDÜR; çelişirse bu geçerli)

**Render işleri (MCP ile) TAMAMLANDI:**
- **Canlı servis:** Oregon `KALEM` (`srv-dahbje6q1p3s73befhng`) artık **Starter** planda — uyku/SSE ölümü sorunu kapandı. `autoDeploy` AÇIK (push = deploy). Env'ler panelde elle girili; `render.yaml` Blueprint'ten senkronlanmıyor (canlı mutabakat cron'u `render.yaml`'daki 30 sn değil ilk değer olan 10 sn'de kaldı) — yaml artık referans niteliğinde, gerçek kaynak panel.
- **Frankfurt denemesi:** `KALEM-frankfurt` kuruldu, ölçüldü, **Oregon kazandı** (Horizon submit ort. ~3,8 sn Oregon vs ~5,0 sn Frankfurt, 6'şar ödeme; kullanıcı 5'er ödemeyle de Oregon'u belirgin hızlı buldu; muhtemel neden: Stellar testnet Horizon ABD tarafında — doğrulanmadı). Frankfurt servisi **suspend** (silinmedi). Geri açılırsa onun `POOL_FEEDER_CRON`'u `*/5` — önce yılda-bire (`0 0 1 1 *`) çek, yoksa Oregon'la Havuz 2 sequence'i çakışır. Frankfurt'ta `TRUST_PROXY_HOPS` **2** ölçüldü (Oregon'da 3; 3 Frankfurt'ta sahte XFF'e açık çıktı).
- **Ödeme hatası ("işlem Stellar ağına iletilemedi") kök nedeni:** `FEE_BUMP_MAX_TOTAL_FEE_STROOPS` tavanı (10M = 1 XLM). dTL bakiye kaydı OLMAYAN bir hesaba İLK ödeme ~10,06M stroop kaynak ücreti tutar (kontratta bakiye kaydı 30 gün TTL ile yazılır); sonraki ödemeler 36.596. Tavan iki serviste **20.000.000** yapıldı. Maliyeti Havuz 2 öder (~1 XLM/yeni alıcı).
- **Ödeme süresi:** Oregon'da ~4,5-6 sn; bunun ~4 sn'si Stellar ledger kapanışı (bölgeden bağımsız). 15-20 sn'den düşüşün nedeni §9.10 hız turu kodunun 19 Eylül'de canlıya çıkması.

**Git durumu:** Faz 0-3 iki commit olarak eklendi — `f3ac44e` (backend) ve `b84a43a` (client + "Test ağı" etiketi; etiket aynı dosyalarla iç içe olduğu için ayrı commit'e bölünemedi). **Push EDİLMEDİ**; push = Oregon'a otomatik deploy (Faz 0-3 canlıya çıkar). `docs/ui-polish/*.png` kullanıcı kararıyla repoya GİRMEZ. `flow.html` hâlâ commit'siz ve gösterilmedi.

**KALAN İŞLER:** (1) push + canlı doğrulama (fişte TL/VKN/sepet, esnaf ana sayfası canlı backend'e karşı, Atlas indeksi, CSV Türkçe Excel'de, /flow ile ölçüm); (2) `flow.html` gösterip onay; (3) onay bekleyen küçük kararlar (aşağıdaki 7. madde); (4) gerçek telefon testi (kullanıcı); (5) sunum senaryosu (cold start ısıtma artık gereksiz); (6) **`FLOW_PANEL_TOKEN=kalem_panel` tahmin edilebilir — rastgele değerle değiştir**; gizli anahtarlar/Mongo şifresi 20 Eylül'de sohbete yapıştırıldı → mainnet/gerçek kullanım öncesi döndür; (7) `render.yaml`'ı gerçek duruma getir (Starter, Oregon); (8) opsiyonel: Atlas'ı ABD bölgesine taşı (~0,4 sn), bir hafta sonra Frankfurt'u sil.

**CANLI DOĞRULAMA SONUCU (Faz 0-3 push sonrası, 20 Eylül 13:17):** 3 commit push edildi (`ad91351..1fe78d1`), Oregon deploy `dep-danto7vavr4c73anjc50` canlı; yeni esnaf uçları yetkisiz isteğe 401 verir (route'lar ayakta). Demo QR ile 2-3 ödeme yapıldı: ödeme başarılı, sunucu ~6,1 sn (Horizon submit ~5,0 sn), `feeCharged` 26.611, dağılım %99,6/%0,1/%0,3, GİB belgesi `okc_fis` `generated` `simulated:true`, loglarda hata yok. Müşteri fişi **"1.00 TL"** gösteriyor (kullanıcı kabul etti). DOĞRULANMADI: sepet satırları (demo QR'da sepet yok), gerçek VKN/ad fişte, esnaf ana sayfası verisi, `merchant_seen` adımı, `recordChainOutcome` canlıda.

**YENİ EKLENEN İŞLER (20 Eylül, kullanıcı bildirdi):**

**🟢 AÇIK NOKTA TEMİZLİĞİ + BEKLEYEN KARARLAR — 20 Eylül 2026 gece.**
- **`EsnafQrScreen` sonsuz "Ödeme bekleniyor…" DÜZELTİLDİ** (`6301b01`): `getCurrentLedger()` yalnızca bir kez, poll döngüsünün DIŞINDA deneniyordu; o an ağ koptuysa `sinceLedger` null kalıyor, `poll()` ilk satırda dönüyor ve BİR DAHA planlanmıyordu (ağ gelse bile ekran ödemeyi asla görmezdi). Ledger alma döngünün içine alındı; ayrıca 3 ardışık başarısız turdan sonra esnafa "zincir okunamıyor" uyarısı gösteriliyor.
- **Ödeme zaman aşımı ÇÖZÜLEBİLİR yapıldı** (`60f5b63`): sonuca `innerTxHash` eklendi, "Durumu Kontrol Et" düğmesi onayı yeniden arar; onay bulunursa ekran "Tamamlandı"ya geçer VE fiş o anda arşive yazılır. Bu, gerçek bir boşluğu kapattı: zaman aşımına uğrayan ödeme sonradan onaylansa bile Fişlerim'e HİÇ girmiyordu. Eski "kısa süre sonra işlem geçmişinde görünecektir" mesajı yanlış olduğu için kaldırıldı.
- **Bakiye yenileme hatası görünür yapıldı** (`e5ad9c0`): `handleRefresh` hatayı sessizce yutuyordu. Son bilinen bakiye ekranda kalır ama "tazelenemedi, güncel olmayabilir" uyarısı gösterilir.
- **`EsnafHistoryScreen` SİLİNDİ** (`b4d3161`): ölü koddu (yalnızca `MerchantHistory` rotasında duruyordu, hiçbir yerden navigate edilmiyordu). İşlevi esnaf kabuğundaki "Faturalarım" sekmesinde.
- **Canlı mutabakat cron'u düzeltildi:** Oregon'da `RECONCILIATION_CRON` 10 sn'den `*/30 * * * * *`'ye, `RECONCILIATION_MIN_AGE_MS` 20000'e çekildi (MCP ile); artık `render.yaml` ile uyumlu, loglarla doğrulandı.
- **Esnaf QR ekranında "Geri" düğmesi ZATEN VARDI** (`WaitingView` içinde `BackButton`) — bu bekleyen karar için iş gerekmedi.
- **Metinler doğrulandı, korundu:** "Ağ ücreti sizden alınmaz" / "Ağ ücretini KALEM üstlenir" (ücreti Havuz 2 fee-bump ile öder → DOĞRU), "Anahtarınız cihazdan çıkmaz" (imzalama cihazda, gizli anahtar sunucuya gitmez → DOĞRU).
- **"Hizmet Bedeli" adı korundu:** yalnızca gün sonu CSV başlığında geçer (`merchant-report.service.js`, "Hizmet Bedeli %0,3"); arayüz/panel dilinde aynı kalem "Havuz 4 (Operasyonel)" olarak etiketlenir. İkisi farklı bağlamlar olduğu için birleştirilmedi — muhasebe belgesinde "Operasyonel" anlamsız, panelde "Hizmet Bedeli" havuz yapısını gizlerdi.
- **[YENİDEN YAPILACAK] `/flow` paneli tasarımı:** kullanıcı 20 Eylül'de mevcut `flow.html` tasarımını REDDETTİ ("hayalimdeki şeyi yapamadın"); kendisi bir çare/yön düşünecek. Mevcut dosya commit'siz kalır, COMMIT ETME. Görsel sorunlar (kullanıcı beğenmeme sebebini ayrıca söylemedi): etiketler boruların üstüne biniyor, "Havuz 3 (Sosyal)" yazısı Onaylandı düğümüne çakışıyor. Yeni yön kullanıcıdan gelene kadar bu konuda tasarım işi başlatma. Mock ekran görüntüleri: `docs/ui-polish/flow-*.png` (repoya girmez).
- **[TEST] İkinci telefonla gerçek QR testi:** kullanıcının şu an ikinci telefonu yok. Esnaf ekranında üretilen QR'ı ikinci cihazdan okutup ödeme; sepet satırları, `merchant_seen` adımı ve esnaf ekranının "ödeme alındı" geçişi bununla doğrulanacak (tek cihazla esnaf ekranından çıkılınca bu akış test edilemiyor).
- **[BUG/UX] Müşteri panelinden rol seçimine dönüş yok:** `CustomerDashboardScreen`'de "Çıkış / Rol değiştir" düğmesi yok; müşteriye girince esnafa geri dönülemiyor ("içeride hapsolma"). "Çıkış Yap" yalnızca esnaf Hesap sekmesinde (`AccountTab`, `reset('RoleSelect')`). Eski bir eksik (81c572a'dan beri), regresyon değil. Web geçici çözüm: sayfayı yenile (başlangıç rotası RoleSelect). Öneri: müşteri panelinde de `reset('RoleSelect')` çağıran bir düğme.

**🟢 FİŞ ARŞİVİ + FİŞ İNDİRME — YAPILDI (20 Eylül 2026 akşam).** Kullanıcının fikri: "dijital fiş"i e-posta/SMS ile İTMEK yerine, arayüzde fişlerin biriktiği bir bölme; kullanıcı isterse indirir, isterse kendi uygulamasıyla paylaşır/mailler.

- **Neden bu yol:** push (sunucudan mail/SMS) müşteriden e-posta/telefon TOPLAMAYI gerektirirdi (KVKK aydınlatması, sağlayıcı hesabı, alan adı doğrulaması, demoda "mail gelmedi" riski, SMS'te gönderici başlığı onayı). Pull modelinde sistem HİÇ kişisel veri toplamaz; "mail atma" kullanıcının kendi mail uygulamasıyla olur.
- **Müşteri arşivi CİHAZDA tutulur** (`utils/receiptArchive.js` + `services/receipt-archive.service.js`), sunucuda liste ucu AÇILMADI. Sebep güvenlik: `GET /transactions/:txHash/gib-document` müşteriyi yalnızca `?senderAddress=` eşleşmesiyle yetkilendiriyor ve Stellar adresleri zincirde herkese açık — adres bazlı bir LİSTE ucu, zincirden adres gören herkesin o kişinin tüm alışveriş geçmişini dökmesine izin verirdi. Bedeli: cihaz verisi silinirse liste gider (cüzdan anahtarı da öyle; ekranda kullanıcıya dürüstçe yazılıyor). İleride cihazdan bağımsız istenirse doğru yol: ödemedeki imza mekanizmasıyla yetkilendirilmiş bir uç.
- **Fişin İÇERİĞİ cihazda saklanmaz** — yalnızca txHash + gösterim alanları; belge her açılışta sunucudan taze alınır.
- **Android SecureStore ~2048 bayt sınırı:** arşiv hem kayıt sayısıyla (40) hem bayt bütçesiyle (1800) sınırlı; sığmazsa EN ESKİ kayıtlar düşer, yeni fiş asla kaybolmaz (`packArchive`). Web'de localStorage, sınır sorun değil.
- **İndirme/paylaşma** (`ReceiptActions` + `receipt-download.service.js`): gün sonu CSV'siyle AYNI kalıp — web'de Blob (UTF-8 BOM'lu, Not Defteri Türkçe karakterleri bozmasın), native'de sistem paylaşım sayfası. Yeni bağımlılık YOK. ⚠ Native yol gerçek cihazda DOĞRULANMADI (CSV'de de aynı not).
- **Damga:** indirilen metin ürün kararı gereği "SİMÜLASYON — MALİ DEĞERİ YOKTUR" ibaresini BAŞTA, SONDA ve dosya ADINDA taşır; eski (19 Eylül öncesi) hatalı tutarlı belgelerin uyarısı indirilen metne de yazılır.
- **Ödeme akışına etkisi yok:** `recordReceipt` hata FIRLATMAZ; depo dolu/erişilemez olsa bile ödeme sonucu etkilenmez, yalnızca liste eksik kalır.
- **Dosyalar:** yeni — `utils/receiptArchive.js`, `services/receipt-archive.service.js`, `services/receipt-download.service.js`, `components/ReceiptActions.js`, `screens/CustomerReceiptsScreen.js`, `screens/CustomerReceiptScreen.js`, `test/receipt-archive.test.js`; değişen — `App.js` (2 rota), `CustomerDashboardScreen` ("Fişlerim" + "Çıkış Yap"), `PaymentScreen` (arşive kayıt + fiş indirme), `EsnafReceiptScreen` (fiş indirme).
- **Test:** client 37/37 (18'i bu özellik: bozuk veri, tekrar engelleme, sıralama, bayt bütçesi, damga, dosya adı).
- **JÜRİYE ANLATIM SINIRI:** "fişi mail ile GÖNDERİYORUZ" DEME — doğrusu "kullanıcı fişini kendi mail/mesaj uygulamasıyla paylaşabiliyor". Ayrıca sistemde İADE AKIŞI YOK (kontratta yalnızca `pay_merchant`); doğrusu "iade talebinde fişini ibraz edebilir".

**🟢 MÜŞTERİ KABUĞU — YAPILDI (20 Eylül 2026 akşam).** Müşteri tarafı bugüne dek tek ekran + alt alta düğmelerdi (eski fazdan `81c572a`); esnafta yapılan sekmeli kabuğun karşılığı yoktu ve bu demoda asimetri olarak görünüyordu. Artık esnafla simetrik: **4 sekme + ortada yükseltilmiş büyük "ÖDEME YAP"** (Ana Sayfa · Fişlerim | ÖDEME YAP | Bakiye · Hesap).
- **Backend işi YOK** — gereken verinin tamamı zaten vardı: bakiye zincirden, işlem geçmişi/özet cihazdaki fiş arşivinden, hesap bilgileri cihazdan.
- **Sekme çubuğu ortaklaştırıldı:** yerleşim/ölçüler `components/TabBar.js`'e çıkarıldı; `MerchantTabBar` artık onu saran ince bir dosya (davranışı ve `TAB_BAR_CLEARANCE` dışa aktarımı korundu, esnaf sekmeleri değişmedi). Müşteri için `components/customer/CustomerTabBar.js`.
- **Ana Sayfa:** bakiye + "Bu Ay" özeti (harcama + işlem sayısı, `summarizeArchive`, ay sınırı TÜRKİYE saatine göre) + son 3 işlem. Özet, "tüm harcamanız" DEĞİL "bu cihazda kayıtlı onaylı ödemeleriniz" olarak anlatılır (arşiv cihazda ve yalnızca onaylı ödemeler yazılıyor).
- **Fişlerim** sekmeye dönüştü; ayrı `CustomerReceiptsScreen` ve `CustomerReceipts` rotası SİLİNDİ (ölü kod bırakılmadı). Fiş detayı (`CustomerReceipt`) ayrı ekran olarak kaldı.
- **Hesap sekmesindeki ifade** kodla doğrulanabilirle sınırlı tutuldu: anahtar cihazda üretilir/saklanır, imzalama cihazda yapılır, anahtar sunucuya gitmez. Web deposunun ŞİFRELENMEMİŞ olduğu (§6.5) göz ardı edilip "güvende" denmedi.
- **YAN DÜZELTME (dikkat):** ödeme sonucu ekranındaki **"Ana Ekrana Dön" düğmesi aslında ana ekrana DÖNMÜYORDU** — `handleReset` ile QR tarayıcıya geri sarıyordu (eski davranış, regresyon değil). Artık gerçekten ana ekrana döner (`goBack`); tekrar ödeme için ayrı **"Yeni Ödeme"** düğmesi eklendi. Bu, yeni fişin ana sayfada anında görünmesini de sağlar (Navigator tek ekran render ettiği için dönüşte arşiv yeniden okunur).
- **Dosyalar:** yeni — `components/TabBar.js`, `components/customer/{CustomerTabBar,CustomerHomeTab,CustomerReceiptsTab,CustomerBalanceTab,CustomerAccountTab,ReceiptRow}.js`; değişen — `CustomerDashboardScreen` (kabuk), `MerchantTabBar` (sarmalayıcı), `PaymentScreen` (Ana Ekrana Dön/Yeni Ödeme), `App.js`; silinen — `screens/CustomerReceiptsScreen.js`.
- **Test:** client 42/42 (5'i `summarizeArchive`: ay sınırı TR saati, bozuk tutar/tarih dayanıklılığı). `expo export --platform web` başarılı.
- **DOĞRULANMADI:** ekranlar gözle görülmedi (paketleme geçiyor); gerçek cihazda native davranış denenmedi.


---

#### 🔴 OTURUM KAPANIŞ DURUMU — 20 Eylül 2026 (en güncel; aşağıdaki 18/19 Eylül blokları geçmiş kayıttır)

**Kullanıcı Render MCP sunucusunu bağlamak için oturumu kapattı. Yeni oturumda ilk iş: kullanıcı ne yapılacağını KENDİSİ söyleyecek — söylemeden aşağıdaki listeden iş başlatma.**

**Git durumu (`main`, `origin/main` ile senkron = `ad91351`):**
- **YAYINLANDI (push edildi, 19 Eylül):** `c7941f2` hız (ödeme yolunda sıralı işlerin kaldırılması, §9.10) · `4e206a3` UI cilası · `ad91351` docs. ⚠ `render.yaml`'da `autoDeploy` yok → Render varsayılanı AÇIK; bu push canlıyı yeniden deploy etmiş OLABİLİR (canlı health `uptimeSeconds: 13` gösterdi: uyanma mı deploy mu belirsiz — Render'da Events sekmesinden ya da MCP ile kontrol et). Faz 0-3 bu deploy'a DAHİL DEĞİL.
- **COMMIT'SİZ (diskte güvende, 40 dosya) — kullanıcı henüz commit onayı vermedi:** Faz 0-3 (esnaf ana ekranı + raporlama) ve "Test ağı" etiketi. Ayrıntı: aşağıdaki "ESNAF ANA EKRANI + RAPORLAMA" bloğu. Önerilen 4 parçalı commit bölümü (kullanıcıya SORULDU, cevap verilmedi): (1) GİB düzeltmeleri A/B/C + para/sepet yardımcıları + backend okuma uçları + testler + `.env.example`; (2) esnaf arayüzü (kabuk, sekmeler, tutar klavyesi, fiş ekranı, CSV indirme, TL biçimi, client testleri); (3) "Test ağı" etiketi; (4) dokümanlar. `docs/ui-polish/*.png` (~1 MB) untracked — repoya girsin mi kullanıcıya sorulmadı.
- **`orchestrator/public/flow.html` — commit'siz, hiç gösterilmedi, kullanıcı: "şimdilik dokunma, göstermene gerek yok, Faz 0-3 bitince ayrıca konuşuruz".** İçerik aşağıda (18 Eylül bloğu). Kullanıcı açmadan konuşma; commit ATMA.
- Testler (son çalıştırma 19 Eylül): orchestrator **227/227**, client **19/19** (`node --test client/test/format.test.js client/test/dates-and-input.test.js`). "Test ağı" etiketi sonradan eklendi (yalnızca statik kontrol + rol seçimi görsel kontrolü).

**YAPILACAKLAR — sonraki oturum (kullanıcı ilk açılışta hangilerini istediğini söyleyecek; öncelik sırası tahmindir):**
1. **Render MCP bağlantısını doğrula:** yeni oturumda `render` MCP araçları görünmeli. Kurulum: `claude mcp add --transport http render https://mcp.render.com/mcp` → `/mcp` → Authenticate (OAuth); olmazsa API anahtarıyla `--header "Authorization: Bearer <ANAHTAR>"`. ⚠ Doğru adres `https://mcp.render.com/mcp` (`mcp-server.render.com` YOK). `--scope project` KULLANMA (anahtar repoya sızar). Anahtarı sohbete yapıştırtma. Env değiştirme / deploy tetikleme / servis oluşturma öncesi kullanıcıdan onay al. İlk komut: "Set my Render workspace to …".
2. **Canlı durumu MCP ile kontrol et:** son deploy (Events/deploy geçmişi) ve loglar; `POOL3_ADDRESS` env'i tanımlı mı (yoksa Sosyal Fon toplamı `null`); `TRUST_PROXY_HOPS`; SSE durumu.
3. **Faz 0-3'ü commit'lere böl** (yukarıdaki 4 parça), kullanıcı onayıyla commit → push. Push auto-deploy tetikler: ödeme yolundaki `cartItems` eklemesi (`transaction.routes.js`, 5 satır) ve yeni uçlar canlıya çıkar.
4. **Deploy sonrası canlı doğrulama:** gerçek bir ödemeyle — fişte doğru TL / gerçek VKN+ad / sepet satırları (A/B/C); esnaf ana sayfasının canlı backend'e karşı açılması (client bugüne dek yalnızca sahte yanıtlarla test edildi); Atlas'ta `{merchantId, createdAt}` indeksi; gün sonu CSV'nin gerçek Excel'de (TR) açılışı; `/flow` zaman damgalarıyla ödeme süresi ÖLÇÜMÜ (§9.10 kazançları hâlâ tahmin).
5. **Atlas Frankfurt ↔ Render Oregon uyumsuzluğu** (aşağıdaki 🟡 blok): Frankfurt'ta yeni servis (kullanıcı elle ya da MCP ile — MCP'nin bölge seçebildiği DOĞRULANMADI), `TRUST_PROXY_HOPS` yeniden ölçümü (3 varsayılma), eski/yeni karşılaştırmalı ölçüm. Plan kararıyla (free/starter, cold start + SSE ölümü) birlikte düşünülmeli.
6. **`flow.html`** — kullanıcı ayrıca konuşacak: ekran görüntüsüyle göster, onay al, sonra commit.
7. **Onay bekleyen küçük kararlar (kullanıcı cevaplamadı):** zaman aşımında "Ödeme İletildi" (yeşil "Tamamlandı" yerine); esnaf QR bekleme ekranındaki "Geri" düğmesi; yeni metinler ("Ağ ücreti sizden alınmaz", "Anahtarınız cihazdan çıkmaz", onaysız esnaf uyarısı) — içerikleri kullanıcı doğrulasın; %0,3'lük kalem için "Hizmet Bedeli" adı benim seçimim; `EsnafHistoryScreen` ölü kod (silinsin mi?).
8. **Gerçek telefon testi** (kullanıcı yapacak): QR tarama, kamera izni, ekrandan okuma; native (iOS/Android) UI (`Animated`, `adjustsFontSizeToFit`); CSV native paylaşım yolu.
9. **Sunum senaryosu hazırlığı (§8 adım 4) — hâlâ BAŞLANMADI:** demo akışı, `DEMO_MODE`, faucet tutarları; cold start (~50 sn) ısıtma; faucet adres başına saatte 5 istek.
10. **Zaman kalırsa:** işlem detay ekranı — her ödeme için `flowEvents` zaman çizelgesi + dağılım (esnaf/sosyal fon/operasyonel) + fiş/zincir bağlantısı (Faz 5 madde 1; veri Mongo'da hazır). PDF gün sonu (Faz 4), grafik ve uyarılar (Faz 5) bilerek atlandı.
11. **Bilinen açık noktalar:** `EsnafQrScreen`'de `getCurrentLedger()` başarısız olursa sonsuz "Ödeme bekleniyor…" (mantık, dokunulmadı); dashboard bakiye yenileme hatası sessiz; giriş/kayıt/cüzdan/bakiye yükleme/eski geçmiş ekranları eski stilde; 15 Eylül öncesi işlemlerde komisyon "veri yok" (bilinçli); eski GİB fişleri hatalı tutar taşır (ekranda uyarılıyor, belge değiştirilmedi).

---

**(Geçmiş kayıt — 18 Eylül 2026 oturumu; `flow.html` hâlâ commit'siz, aşağıdaki "COMMIT DURUMU" ifadeleri o günün durumudur.)**

- `flow.html`'deki commit'lenmemiş içerik: kullanıcı geri bildirimi üzerine yapılan görsel büyütme/yumuşatma — daire yarıçapı 62→85, boru kalınlığı 32→44, SVG genişliği `min(92vw,760px)`→`min(94vw,1200px)`, palet cırtlak/neon tonlardan soft/mat (Stripe/Linear esintili, `#F7ECE0` arkaplan + `#6E9F82` sıvı yeşili) tonlara, animasyon geçiş süresi 1.7s→2.4s (`ease-in-out`, sert `cubic-bezier` kaldırıldı). **Bu değişiklik için kullanıcıya yeni ekran görüntüsü henüz gösterilmedi, onay alınmadı.**

**Bu oturumda üzerinde çalışılan üç iş kalemi — hiçbiri yarım değil, üçü de netleşmiş durumda:**

1. **7. adım gecikme düzeltmesi (senkron confirm, §9.9) — TAMAMLANDI.** Kodlandı ve commit'te (`16750ad`). Test edildi: local'de 193/193 (yarış testi `handle-transaction-race.service.test.js` dahil) VE canlıda — Render'daki gerçek bir ödemeden çekilen veriyle `submitted`→`caught` arası **375 ms** ölçüldü, kaynak `submit_response` (mutabakat DEĞİL) doğrulandı. Yarım kalan yok.
2. **5-6. adımın Soroban RPC'den okunması (contract/distribution) — TAMAMLANDI.** RPC-okuma mantığının kendisi (`contract-events.service.js`) önceki oturumdan (§9.3) zaten mevcuttu; bu oturumda yalnızca `transaction.routes.js`'teki çağrı sırası (`transaction.save()` önce, `recordChainOutcome` sonra) düzeltildi — aynı `16750ad` commit'inde, ayrıca commit gerekmiyor. Canlı doğrulama: aynı gerçek işlemde `contract`/`distribution` adımları doğru zincir verisiyle (havuz 1/3/4 tutarları, `sumMatchesTotal: true`) göründü. Yarım kalan yok.
3. **GİB fişinin müşteri ekranını bloklamaması — KOD DEĞİŞİKLİĞİ GEREKMEDİ, sadece incelendi ve kapatıldı.** Kullanıcı backend'de böyle bir bağımlılık olup olmadığını sordu. Kod incelemesiyle doğrulandı (`client/src/screens/PaymentScreen.js:113-126`, `client/src/services/stellar-read.service.js:79-111`, `orchestrator/src/services/notification.service.js`, `sse-listener.service.js:114-153`): müşteri ekranı zaten backend'in GİB üretiminden ve `notifyClient()`'tan (kendisi hâlâ boş bir stub — Faz 3 TODO) tamamen bağımsız; kendi Horizon sorgusuyla (`awaitInnerTransactionConfirmation`) onaylıyor. **Hiçbir kod değişikliği yapılmadı çünkü mimari zaten doğruydu.** İleride not: `notifyClient()` gerçekten implemente edilirse GİB'den önce/bağımsız çağrılacak şekilde sıralanmalı (şu an sıralama önemsiz, çünkü fonksiyon boş).

**🟡 BÖLGE UYUMSUZLUĞU TESPİT EDİLDİ — ÇÖZÜM HENÜZ UYGULANMADI (18-19 Eylül 2026):** MongoDB Atlas **AWS Frankfurt (eu-central-1)**'de, Render servisi ise **Oregon**'da. Kritik ödeme yolundaki `w:majority` Mongo yazmaları (idempotency kilidi, `Transaction.create`, `transaction.save`, `finalizeIdempotencyKey`) her seferinde kıtalar arası gidiş-dönüş ödüyor; bu, ödeme gecikmesinin **muhtemelen tek başına en büyük kaynağı** (henüz ölçülmedi — bu bir tahmin). §9.10'daki kod optimizasyonları (sıralı yazma sayısını azaltma) bu maliyeti küçültür ama ortadan kaldırmaz.
- **Planlanan çözüm:** Render'da **Frankfurt** bölgesinde yeni bir servis kurulacak (**kullanıcı elle yapacak**), ardından eski (Oregon) / yeni (Frankfurt) servis için **karşılaştırmalı ölçüm** yapılacak. Ölçüm, aynı gerçek ödeme akışında `/flow` zaman damgalarıyla (`received`→`submitted`) yapılabilir.
- **Bu adımlar YAPILMADI:** Frankfurt servisi kurulmadı, `render.yaml`'a `region` eklenmedi, karşılaştırmalı ölçüm alınmadı. Yeni servis kurulunca env değişkenleri (`TRUST_PROXY_HOPS` — **yeni bölgede/altyapıda yeniden ölçülmeli, 3 varsayılmamalı**, bkz. §6.2.2; `MONGODB_URI`, `FLOW_PANEL_TOKEN`, `POOL2_SECRET_KEY` vb.) ve client'ın `EXPO_PUBLIC_ORCHESTRATOR_BASE_URL` adresi de güncellenmelidir. Atlas `0.0.0.0/0` erişimi zaten açık olduğundan IP izni gerekmez.
- Karar askıda: bölge değişimi **plan kararıyla (free/starter, bkz. yukarıdaki uyku/SSE notu) birlikte** düşünülmeli — yeni servis de ücretsiz planda kurulursa cold start sorunu aynen sürer.

**🟢 UI CİLASI YAPILDI — COMMIT'LENDİ ve YAYINLANDI (`4e206a3`, 19 Eylül 2026); aşağıdaki 3 küçük karar hâlâ kullanıcı onayı bekliyor:** Kullanıcı yokken, en çok görülen 4 ekran için "tek gecede yapılmış" hissini gidermeye yönelik görsel cila yapıldı. Tema (açık zemin `#F7F8FA`, amber `#D97706`) korundu; yeniden tasarım değil.
- **Önce/sonra ekran görüntüleri:** `docs/ui-polish/*.png` (16 durum; sol = önce, sağ = sonra; commit'lenmedi). Web'de 390 px telefon sütununda headless Chrome ile alındı.
- **Yeni ortak bileşenler:** `Icon.js` (react-native-svg ile çizgi ikon seti, yeni bağımlılık YOK), `BrandMark.js` (amber zemin üzerinde kalem ucu + "KALEM"), `Amount.js` (tutarı hiyerarşik gösterir: tam kısım büyük, `.0000000 dTL` küçük — "124.7500000 dTL"nin dashboard'da iki satıra kırılması düzeldi), `StateViews.js` (`Skeleton`, `PulseDot`, `InlineNotice`, `StatusBadge`, `MerchantAvatar`).
- **Yükseltilen mevcut bileşenler (API geriye uyumlu):** `Button` (opsiyonel `icon`, loading'de etiket korunur), `StatusStep` (dikey bağlantılı stepper + adım açıklaması), `BackButton` (ikonlu), `GibReceiptCard` (marka başlığı, "SİMÜLASYON" etiketi, pürüzlü alt kenar, toplam vurgusu; **rakamlar backend'den geldiği gibi, dokunulmadı**).
- **Yeniden çizilen ekranlar:** müşteri ödeme akışı (tarama → onay → işleme → sonuç, hepsi `PaymentScreen.js` içinde), esnaf dashboard, esnaf QR (bekleme + "ödeme alındı" + e-belge), rol seçimi (marka için küçük dokunuş — istenen 4 ekranın dışında).
- **ÖDEME MANTIĞINA/BACKEND'E/API'YE DOKUNULMADI.** Kanıt: `PaymentScreen.js`'in mantık bölümü (state makinesi, `handleConfirmPayment` vb.) eski sürümle diff'lendi — tek fark `<ProcessingStage>`'e geçirilen ek `qrData` prop'u. `EsnafQrScreen.js`'te mantık (polling, ack, e-belge çağrısı) aynı; tek fark `WaitingView`'a geçirilen `businessName`. Bu iki dosyada sunum, `export`lu alt bileşenlere ayrıldı (`ScanStage/ConfirmStage/ProcessingStage/ResultStage`, `WaitingView/PaymentReceivedView`).
- **İNCELEMEDE KARAR VERİLMESİ GEREKEN küçük davranış/metin değişiklikleri** (istenirse geri alınır):
  1. Zincir onayı **zaman aşımına** düşen ödeme artık yeşil "Ödeme Tamamlandı" yerine turuncu saat rozetiyle **"Ödeme İletildi"** gösteriyor (eskiden yeşil onay + uyarı metni vardı; yanıltıcıydı).
  2. Esnaf QR bekleme ekranına **"Geri" düğmesi** eklendi (eskiden ekrandan çıkış yolu yoktu; polling unmount'ta zaten duruyor).
  3. Yeni metinler: onay ekranında "Cihazınızda imzalanır · Ağ ücreti sizden alınmaz"; işleme adımlarında "Anahtarınız cihazdan çıkmaz / Ağ ücretini KALEM üstlenir / Stellar ağı işlemi kesinleştiriyor"; dashboard'da onaysız esnaf için "Zincir kaydınız henüz onaylanmadı. Onaylanana kadar gelen ödemeler zincirde reddedilebilir."; bakiye okunamazsa bilgi notu. **İçerikleri sen doğrula.**
  4. Sonuç ve "ödeme alındı" ekranları artık kaydırılabilir (e-belge açılınca küçük telefonda taşıyordu).
- **Bulundu ama DEĞİŞTİRİLMEDİ (mantık olduğu için):** `EsnafQrScreen`'de `getCurrentLedger()` başarısız olursa polling hiç başlamıyor ve ekran sonsuza dek "Ödeme bekleniyor…" gösteriyor (hata/yeniden deneme yolu yok). Ayrıca dashboard'da bakiye yenileme hatası sessizce yutuluyor. İkisi de ayrı bir karar/iş.
- **Doğrulama durumu:** web'de headless Chrome ile 16 durumun görsel kontrolü + kapsam dışı 3 ekranın (tutar girişi, esnaf girişi, müşteri cüzdanı) ortak bileşen değişikliklerinden sonra bozulmadığının görsel kontrolü + statik tanımsız-değişken taraması (temiz). **DOĞRULANMADI:** iOS/Android'de çalıştırma (özellikle `Animated` native sürücüsü, `adjustsFontSizeToFit`), gerçek kamerayla tarama ekranı (sahte kamera akışıyla görüldü), kamera izni reddi/desteklenmiyor dalları (yalnızca kodla incelendi), "Kopyalandı" geri bildirimi. Gerçek telefonda bir tur atılmalı.
- **Yapılmadı:** esnaf giriş/kayıt/tutar girişi, müşteri cüzdanı/bakiye yükleme, işlem geçmişi ekranları eski stilde (yeni bileşenlerle kolayca uyarlanabilir); işlem geçmişinin boş/hata durumu ele alınmadı.
- **Araç notu:** Chrome eklentisi bağlanamadığı için ekran görüntüleri komut satırından headless Chrome ile alındı; sahte verili geçici önizleme galerisi (`client/src/dev`, `?preview=` bağlantısı) iş bitince SİLİNDİ — `App.js` orijinal halinde.

**🟢 ESNAF ANA EKRANI + RAPORLAMA (Faz 0-3) YAPILDI — COMMIT'SİZ, İNCELEME BEKLİYOR (19 Eylül 2026):** Kullanıcının onayladığı kararlar: TL biçimi `1 TL / 1,50 TL`; fiş düzeltmeleri A+B+C (**eski belgelere dokunulmaz**, yalnızca yeni belgeler doğru); Sosyal Fon kartı dürüst anlatımla ("Sosyal Fon'a katkınız"); eski işlemlerin komisyon boşlukları **"veri yok" kalır, doldurma yapılmaz**; gün sonu **yalnızca CSV**, "SİMÜLASYON, mali değeri yoktur" damgası zorunlu; ekran düzeni alt çubuk + ortada yükseltilmiş büyük "Ödeme Al". **Faz 4 (PDF) ve Faz 5 (grafik, uyarılar) BİLEREK atlandı.**
- **Faz 0 — veri düzeltmeleri.** (A) `gib-simulator` artık tutarı **stroop→TL çeviriyor** (5 TL fişte 5,00 TL; eskiden 50.000.000 TL — bkz. `utils/money.js`); (B) fişe gerçek `Merchant.taxId` ve `businessName` yazılıyor (eskiden Mongo ObjectId + sabit ad); (C) `cartItems` artık `Transaction`'a **temizlenerek** saklanıyor (`utils/cart-items.js`, asla hata fırlatmaz) ve fiş satırlarına yalnızca **Σ birim fiyat × adet == toplam** ise yansıyor (aksi halde tek satır). KDV %20 sabit (simülasyon), matrah/KDV kuruş kuruşuna toplamı tutuyor. **Not: ödeme yolu dosyasına (`transaction.routes.js`) tek ekleme yapıldı** — `Transaction.create`'e `cartItems: sanitizeCartItems(...)` alanı; çöp sepetin ödemeyi bozmadığı testle kanıtlı. Client'ta tüm tutarlar `formatTl` ile TL (`utils/format.js`); `dTL` yalnızca iç/teknik dilde kaldı. 
- **Faz 1 — backend okuma uçları** (`merchant-reports.routes.js`, `merchant-report.service.js`; hepsi esnaf Bearer + yalnızca kendi verisi + IP rate limit; **ödeme yoluna dokunmaz**): `GET /merchants/:id/dashboard` (bakiye + bugünkü özet + son 5 işlem + Sosyal Fon, **tek çağrı** — Atlas/Render bölge uyumsuzluğu yüzünden gidiş-dönüş sayısı bilinçli minimumda), `GET /merchants/:id/transactions` (cursor'lı sayfalama; `date=` verilirse o günün TAMAMININ özeti), `Transaction` üzerine `{merchantId, createdAt}` indeksi. Gün sınırı **Türkiye saati (UTC+3 sabit)**. Brüt = `totalAmount`, Net = `pool1`, Komisyon = `pool3`+`pool4`; dağılım verisi olmayan işlemler toplamlara girmez ve `missingBreakdownCount` ile bildirilir. Sosyal Fon toplam bakiyesi zincirden `POOL3_ADDRESS` ile okunur (30 sn önbellek; adres yoksa/okunamazsa `null`).
- **Faz 2 — esnaf arayüzü.** Yeni kabuk (`EsnafDashboardScreen` — rota adı `MerchantDashboard` aynı, giriş/kayıt akışı değişmedi) + alt çubuk (Ana Sayfa · Faturalarım · **büyük Ödeme Al** · Gün Sonu · Hesap) + sekmeler (`components/merchant/*`). Ana sayfada ayrıca tam genişlikte dev "Ödeme Al" kartı. Bugünkü Özet, Bakiye, Sosyal Fon katkısı, son işlemler; yükleniyor (iskelet + "sunucu uyanıyor" ipucu), hata (tekrar dene), boş durumlar. Faturalarım: sayfalı liste (tutar, tarih, komisyon/net veya "Komisyon verisi yok", fişe bağlantı). Fiş ekranı (`EsnafReceiptScreen`): **düzeltme öncesi üretilmiş bir fişte tutar işlemle tutmuyorsa ekranda uyarı ve doğru tutar gösterilir (belge değiştirilmez).** Tutar girişi yeniden yazıldı: büyük gösterge + sayısal klavye (en fazla 2 ondalık, kuruş) + hızlı tutarlar + web'de fiziksel klavye; QR yükü/stroop tutarı eskisiyle aynı.
- **Faz 3 — gün sonu CSV.** `GET /merchants/:id/reports/daily?date=YYYY-MM-DD`: UTF-8 BOM, `;` ayraç, virgüllü ondalık, Türkiye saati; sütunlar Belge No, Saat, Brüt, Matrah, KDV, Sosyal Fon, Hizmet Bedeli, Toplam Komisyon, Net, İşlem No; TOPLAM satırı; **"*** SİMÜLASYON — MALİ DEĞERİ YOKTUR ***" damgası başta ve sonda + açıklama satırı + dosya adında `SIMULASYON`**; formül enjeksiyonu (`= + - @`) etkisizleştirilir; tutarlar `Transaction.totalAmount`'tan hesaplanır (eski/şişkin fişlerden değil). Client: web'de Blob indirme; native'de sistem paylaşım sayfası (yeni bağımlılık YOK).
- **Testler:** orchestrator **227/227** (194 → 227; +GİB A/B/C, para/sepet birim testleri, uçtan uca fiş testi, 18 raporlama testi: yetki, özet matematiği, eksik veri, sayfalama, **UTC+3 gün sınırları**, CSV içeriği/damga/BOM/enjeksiyon), client **19/19** (`node --test client/test/format.test.js client/test/dates-and-input.test.js`). Ekranlar web'de headless Chrome'da **sahte `fetch`** ile gerçek bileşenler üzerinden görsel doğrulandı (23 durum: `docs/ui-polish/esnaf-*.png`, commit'siz).
- **DOĞRULANMADI / yapılması gerekenler:** (1) **Render'a deploy edilmedi** — yeni uçlar canlıda YOK; deploy sonrası gerçek Atlas'ta yeni indeksin kurulduğu ve `POOL3_ADDRESS`'in Render env'inde tanımlı olduğu (aksi halde Sosyal Fon toplamı `null` döner) kontrol edilmeli. (2) İstemci canlı backend'e karşı **hiç çalıştırılmadı** (yalnızca sahte yanıtlarla). (3) iOS/Android'de çalıştırma, native paylaşım yolu ve CSV'nin gerçek Excel'de (TR yerel) açılışı denenmedi. (4) Ödeme akışı canlıda bir ödemeyle yeniden denenmedi (yalnızca testler).
- **Bilinen sınırlar (bilinçli):** 15 Eylül öncesi işlemlerde komisyon/net "veri yok"; eski fişler hâlâ hatalı tutar taşıyor (ekranda uyarılıyor); gün sonu raporu günde en fazla 2000 işlem; komisyon 7 hane hassasiyetinde (0,005 TL gibi) ama GİB belgeleri kuruşa yuvarlanır; "Test ağı" etiketi 20 Eylül'de EKLENDİ (`components/TestnetBadge.js`: rol seçimi, ödeme onayı, müşteri cüzdanı, esnaf ana sayfası — commit'siz); `EsnafHistoryScreen` (eski zincir-olay listesi) artık hiçbir yerden açılmıyor (ölü kod adayı, silinmedi).
- **ZAMAN KALIRSA YAPILACAK EK (şimdi YAZILMADI):** Faz 5 madde 1 — **işlem detay ekranı**: her ödeme için `flowEvents` zaman çizelgesi ("ödeme yolculuğu") + dağılım (esnaf/sosyal fon/operasyonel) + fiş ve zincir bağlantısı. Veri zaten Mongo'da (`Transaction.flowEvents`, `pool*Amount`); Faturalarım satırından açılacak şekilde tasarlanabilir.

**Sıradaki adım:** ESKİ (18 Eylül) sıra geçersiz. Güncel liste ve kurallar için §8.2'nin en üstündeki **"OTURUM KAPANIŞ DURUMU"** bloğuna bak — kullanıcı yeni oturumda ilk işi kendisi söyleyecek.

### Tamamlanan katmanlar (hepsi gerçek testnet'te doğrulandı)

- **Kontratlar v1 + v2** (`contracts/`): `dtl-token` ve `pool-manager`, 38/38 Rust birim testi PASS, testnet'e deploy edildi. v2 ile müşteri→esnaf gerçek `pay_merchant()` ödemesi eklendi (§7); esnaf-gönderemez guard'ı gerçek ağda negatif kanıtla doğrulandı (§7.5).
- **`orchestrator/`**: Kalıcı MongoDB Atlas bağlantısı (§6.1), CORS (§6.6), fee-bump ile gerçek işlem gönderimi + idempotency, SSE dinleyicisi ile onay yakalama, GİB e-Belge simülasyonu + görüntüleme ucu, esnaf kaydı (adres sahipliği imzası + ayrı admin onay script'i `approve-merchant.mjs`), demo musluk (`/faucet/mint`), balance ucunda `kycStatus`/`onChainRegistered`, rate limiting (§6.2.1), liveness/readiness sağlık uçları + SSE canlılık raporlaması, mutabakat job'ı (§6.4.1), canlı işlem akışı paneli `/flow` + esnaf ack ucu (§9 — **kod ve testler tamam, canlıda henüz doğrulanmadı**). 190/190 test PASS.
- **`client/` (Expo)**: Müşteri akışı (bakiye yükleme/Friendbot+mint, QR okutup ödeme, GİB fişi görüntüleme) ve esnaf akışı (kayıt, giriş, tutar girip QR üretme, canlı ödeme tespiti, bakiye/rozet, GİB fişi görüntüleme) — tümü gerçek tarayıcı testleriyle ve gerçek testnet tx'leriyle doğrulandı. Stellar SDK 16.2.0 + `metro.config.js` çözümleyici kuralı (§8.1). **Tek istisna: QR okuma gerçek telefon kamerasıyla denenmedi** — bkz. "Bilinen açık nokta".

### Sıradaki adımlar (bu sırayla)

1. **Backend'i bulut sunucuya taşıma** (Render) — ✅ **TAMAMLANDI (12 Eylül 2026).** Servis canlı: <https://kalem-5i08.onrender.com>. Repo kökünde `render.yaml`, `/api/v1/health` (liveness, her zaman 200) ve `/api/v1/health/ready` (readiness, bağımlılık bozuksa 503) ayrımı, SSE canlılık raporlaması, client'ın backend adresi `EXPO_PUBLIC_ORCHESTRATOR_BASE_URL` ile parametreleştirildi. Atlas erişimi `0.0.0.0/0` + yenilenmiş şifreyle açıldı. Canlı doğrulama: `mongodb: connected`, `sseListener.started: true`, CORS tarayıcıdan çalışıyor. Adım adım rehber: `docs/deployment.md` "Bulut Dağıtımı". **Plan: `free` — servis 15 dk trafik almazsa uyur (~50sn soğuk başlatma); sunum öncesi `starter`'a geçiş kararı ASKIDA.**
2. ~~**Rate limiting eklenmesi**~~ — ✅ **TAMAMLANDI (6 Eylül 2026), canlıda DÜZELTİLDİ ve DOĞRULANDI (12 Eylül 2026).** Kapsam öngörülenden geniş tutuldu: `/transactions/submit` ve `/faucet/mint`'e ek olarak `/merchants/register` ve GİB belge okuma ucu da kapsandı (§6.2.1). **Deploy sırasında öngörülen `trust proxy` tuzağı GERÇEKLEŞTİ ve ilk tahmin edilen değer de yanlış çıktı:** `TRUST_PROXY_HOPS=1` iken `req.ip` Render'ın **iç yük dengeleyicisine** (`10.x`) çözülüyordu; o adres tüm kullanıcılarda ortak olduğu için limitler "IP başına" değil **fiilen küresel** sayıyordu. Doğru değer canlı ölçümle **`3`** olarak bulundu (Express soket bağlantısını da hop sayar: `::1` → Render iç → Cloudflare → gerçek istemci) ve uygulandı — bkz. §6.2.2. **Doğrulama:** 15 hızlı istek tek kesintisiz sayaçta düştü (59→45; düzeltmeden önce üç ayrı sayaca bölünüyordu) ve üç farklı sahte `X-Forwarded-For` denemesi gerçek istemciyi değiştiremedi. Tekrarını önlemek için otomatik tespit (`proxy.looksMisconfigured`), tek seferlik uyarı logu ve regresyon testleri eklendi.
3. **Uçtan uca gerçek prova** — ✅ **YAPILDI (12–13 Eylül 2026;** ödeme tx'i zincire 12 Eylül 01:49 TSİ'de yazıldı, düzeltmeler 14 Eylül 01:01'de commit'lendi — tarih zincir zaman damgasından doğrulandı, 15 Eylül 2026**)**, canlı Render backend'i + iki tarayıcı sekmesiyle tam senaryo. Akış baştan sona çalıştı (tx [`b5466573…`](https://stellar.expert/explorer/testnet/tx/b5466573a0233c4d2c8df82f783e11d3a844bf1c24ea1a2c708abd7ea39983d9), esnafa `2.4900000` dTL = %99,6). **Prova üç gerçek hata ortaya çıkardı, üçü de düzeltildi:** (a) client SDK 12.3.0 bugünkü testnet'in Soroban yanıtını ayrıştıramıyordu → SDK 16.2.0'a yükseltildi (§8.1), (b) SDK 16'nın `bignumber.js` bağımlılığı Metro'da boş çözülüp uygulamayı beyaz ekranla öldürüyordu → `client/metro.config.js` (§8.1), (c) SSE hiç mesaj almadığı için GİB belgesi üretilmiyordu → mutabakat job'ı (§6.4.1).
3a. **Canlı işlem akışı paneli (`/flow`)** — ✅ **CANLIDA DOĞRULANDI (17-18 Eylül 2026).** Render'da gerçek bir ödemeyle prova yapıldı; 7. adımın kaynağı `submit_response` (mutabakat DEĞİL) ve `submitted`→`caught` arası 375 ms ölçüldü (bkz. §9.9, §8.2). Aşağıdaki "GİB fişi ~1 dakika gecikebilir" notu artık GEÇERSİZ — mutabakat 30 sn'ye gevşetildi ama artık kritik yol değil, normal akışta devreye hiç girmiyor. **Commit'lenmemiş görsel bir revizyon (daire boyutu/palet/animasyon hızı) hâlâ onay bekliyor — bkz. §8.2.**
4. **Sunum senaryosu hazırlığı** — 🔴 **SIRADAKİ İŞ, HENÜZ BAŞLANMADI.** TEKNOFEST canlı sunumu için adım adım demo akışı, `DEMO_MODE` (§5.2) ve faucet tutarlarının sunuma uygunluğu gözden geçirilmeli. **Provadan çıkan ve bu senaryoya mutlaka girmesi gereken üç pratik nokta:**
   - **İlk istek ~50 saniye sürebilir** — ücretsiz planda servis uykuya geçiyor. Sunumdan hemen önce `/api/v1/health`'e bir istek atıp servisi ısıtmak gerekir.
   - **GİB fişi ~1 dakika gecikebilir** — SSE çalışmazsa mutabakat turu devreye girer (§6.4.1). Sunumda "fiş birazdan gelecek" diyebilmek için bu süre bilinmeli.
   - **Faucet adres başına saatte 5 istek** — prova tekrarlarında bu limite takılmak mümkündür; gerekirse Render'dan `RATE_LIMIT_FAUCET_ADDRESS_MAX` geçici olarak yükseltilebilir.

### Bilinen açık nokta — QR okuma gerçek telefon kamerasıyla TEST EDİLMEDİ

Uçtan uca provada (12 Eylül 2026) QR okuma adımı **sentetik bir kamera akışıyla** yapıldı: `navigator.mediaDevices.getUserMedia` geçici olarak, esnaf ekranından alınan gerçek QR'ın çizildiği bir `canvas.captureStream()` akışıyla değiştirildi.

**Bu yaklaşımın test ETTİĞİ şey:** `jsQR` çözümleme yolu gerçekten çalıştı — QR görüntüden okundu, `parseQrPayload()` doğruladı, esnaf adı ve tutar ekranda doğru göründü, ödeme o veriyle imzalandı. Yani `WebQrScanner` → `parseQrPayload` → ödeme zinciri **gerçek koddur ve doğrulanmıştır**.

**Test ETMEDİĞİ şey:** Gerçek bir kameranın donanım yolu — `getUserMedia` izin akışı, kamera seçimi (`facingMode: environment`), otomatik odaklama, gerçek ışık koşulları, ekrandan QR okumada oluşan moiré/parlama, düşük çözünürlük ve titreme. Sentetik akış kusursuz, sabit ve tam kadrajlı bir görüntü sağlar; gerçek dünya bunların hiçbirini garanti etmez.

**Yapılması gereken (kullanıcı yapacak):** Sunum öncesinde en az bir kez **gerçek bir telefonla** müşteri akışı baştan sona denenmelidir — esnaf QR'ı bir ekranda gösterilirken telefon kamerasıyla okutulmalı. Özellikle kamera izni istemi ve ekrandan okuma kalitesi gözlenmelidir. Bu, kalan tek doğrulanmamış kullanıcı yolu adımıdır.

> İlgili kısıt: web hedefinde `expo-camera`'nın barkod çözümlemesi ÇALIŞMAZ; bu yüzden web'de kendi `getUserMedia` + `jsQR` döngümüz kullanılır (bkz. `client/src/components/WebQrScanner.js` dosya başı). Native (iOS/Android) hedefte farklı bir kod yolu devrededir ve o yol da ayrıca doğrulanmamıştır.

### §8.1. Client SDK Yükseltmesi ve Metro Çözümleyici Kuralı (13 Eylül 2026)

Uçtan uca prova sırasında ödeme adımı **`Bad union switch: 1`** ile patlıyordu. Bu bir prova aksaklığı değil, **sunumda ödeme akışının tamamen çökmesi** demekti.

**Kök neden (tahmin değil, ölçümle):** Aynı `pay_merchant` işlemi iki SDK sürümüyle yan yana çalıştırıldı:

```
client  SDK 12.3.0  -> HATA: Bad union switch: 1
orchestrator 16.2.0 -> BAŞARILI (prepareTransaction çalıştı)
```

Stellar testnet Protocol 23'e geçtiğinde Soroban simülasyon yanıtındaki XDR'a yeni bir union kolu eklendi; SDK 12 onu ayrıştıramıyor. Akışın Ağustos 2026'da çalışıp bugün çalışmamasının sebebi budur — kodda hiçbir şey değişmedi, **ağ değişti**.

**Düzeltme:** `client/package.json` → `@stellar/stellar-sdk@^16.2.0` (orchestrator ile sürüm eşitliği). İstemci kodu zaten SDK 13+ API'si olan `StellarSdk.rpc.*` kullandığı için yükseltme kodla daha tutarlıdır; kullanılan tüm API'lerin 16'da mevcut olduğu tek tek doğrulandı.

**Yükseltmenin ortaya çıkardığı ikinci hata:** Uygulama açılışta beyaz ekranla öldü —

```
TypeError: _bignumber.default.clone is not a function
```

SDK 16, `bignumber.js` v11'e bağımlıdır. Bu paketin `exports` haritası üç koşul sunar ve **`browser` koşuluna karşılık gelen `dist/bignumber.js` hiçbir şey ihraç etmez** (yalnızca `globalThis.BigNumber` atar). Metro web hedefinde bu koşulu tercih ettiği için modül boş görünür. Node tarafı `require` koşulunu aldığından orchestrator etkilenmez — yani SDK'nın değil, **paketleme koşullarının** uyumsuzluğudur ve yalnızca web'i vurur.

**Düzeltme:** `client/metro.config.js` eklendi; yalnızca `bignumber.js` içe aktarmaları CommonJS derlemesine yönlendirilir. Sürüm düşürmekten (SDK `^11.1.4` istiyor) ve `browser` koşulunu tüm paketler için kapatmaktan (diğer paketlerin web uyumluluğunu bozardı) daha dar kapsamlıdır.

### Bilinçli olarak yapılmayanlar — §6 gözden geçirmesi (16 Ağustos 2026 itibarıyla hepsi hâlâ geçerli)

- **§6.1 Kalıcı MongoDB** — ✅ TAMAMLANDI, geçerliliğini koruyor.
- **§6.2 Rate limiting** — ✅ TAMAMLANDI (6 Eylül 2026, §6.2.1). Bilinen sınırlama: bellek-içi store, çok-instance'lı dağıtımda paylaşılmaz.
- **§6.3 `.env` operasyonel süreci** — hâlâ netleşmedi (kim/hangi kanaldan secret sağlayacak, tanımsız).
- **§6.4 SSE kalıcı cursor/reconciliation** — 🟡 mutabakat job'ı ✅ EKLENDİ (§6.4.1, canlı arızayla gerekliliği kanıtlandı); kalıcı cursor hâlâ yok ama mutabakat aynı sorunu pratikte kapatıyor.
- **§6.5 Web'de şifrelenmemiş müşteri anahtarı** — hâlâ değişmedi; testnet/demo kapsamı için kabul edilebilir olarak işaretli kalıyor.
- **§6.6 CORS** — ✅ TAMAMLANDI, geçerliliğini koruyor.
- **§6.7 Faucet** — ✅ TAMAMLANDI; §6.2 kapsamında bekleyen rate-limit boşluğu da 6 Eylül 2026'da kapatıldı (adres başına 5/saat, IP başına 15/saat — §6.2.1).
- **İşlem Geçmişi (esnaf) sayfalama/detay eksikleri** ve **tek cihaz/oturum sınırlaması** — kullanıcı talimatıyla bu iş paketinde kapsam DIŞI bırakıldı, hâlâ eksik, demo için gerekli görülmedi.

---

## 9. Canlı İşlem Akışı Paneli (`/flow`) — 15 Eylül 2026

Sunumda tek bir havuz dağılımını değil, bir ödemenin **baştan sona yolculuğunu** gerçek zamanlı bir zaman çizelgesi olarak göstermek için eklendi. Panel ayrı bir sayfadır (`https://<backend>/flow?token=<FLOW_PANEL_TOKEN>`); projektöre veya ikinci bir cihaza açılır, müşteri telefonu ve esnaf ekranıyla aynı anda izlenir.

### 9.1. Temel kural: sahte animasyon yok

Hiçbir adım zamanlayıcıyla, tahminle veya "şimdiye kadar olmuştur" varsayımıyla işaretlenmez. Her adım, gerçekleştiği kod noktasında yazılan bir olaya (`Transaction.flowEvents[]`) bağlıdır. Olay gelmediyse adım "bekleniyor" kalır; bir adım başarısızsa kırmızıya döner ve sonrakiler "önceki adım başarısız" olarak işaretlenir.

| # | Adım | Olayın yazıldığı yer | Gösterilen gerçek veri |
|---|---|---|---|
| 1 | Müşteri imzaladı | `submitAuthMiddleware` — Ed25519 imzasının kaynak hesaba ait olduğu doğrulandığı an | İmzalayan adres, iç zarf hash'i |
| 2 | Backend'e ulaştı | `idempotencyMiddleware` — kilit alındığı an | Idempotency-Key, kimlik yolu |
| 3 | Fee-Bump sarmalandı | `wrapAndSubmitFeeBump` `onProgress` — dış zarf Havuz 2 ile imzalandığında | Havuz 2 adresi, ücret tavanı, ön-simülasyon sonucu |
| 4 | Zincire iletildi | Horizon gönderim cevabı | Tx hash (explorer bağlantısı), ledger, gönderim→cevap süresi |
| 5 | Soroban kontratı çalıştı | Soroban RPC `getTransaction` (arka planda, cevabı bekletmez) | `SUCCESS`, ledger kapanışı (zincir saati), kesilen ağ ücreti |
| 6 | Atomik dağılım | Aynı RPC cevabındaki `pay_merchant` + 3 `transfer` kontrat olayı | Üç dal, zincirdeki adres ve tutarlarla + iki çapraz kontrol |
| 7 | Onay yakalandı | `handleTransaction(record, { source })` | Kaynak: SSE dinleyicisi mi, mutabakat job'ı mı |
| 8 | GİB belgesi üretildi | `generateGibDocument` sonrası | Belge ID, tür, durum + "GİB gönderimi simülasyon" etiketi |
| 9 | Esnaf ekranında göründü | `POST /transactions/:txHash/merchant-ack` — esnaf ekranı ödemeyi gösterdiği anda | İşletme adı, tespit edilen ledger |

**4, 5 ve 6. adımlar zincirde aynı işlemin, aynı ledger'ın içindedir** — atomik olarak birlikte gerçekleşirler. Panel bunları yapay aralıklarla ayırmaz; aynı ledger numarasını gösterir. Adımların yanındaki süreler **backend'in olayı gözlemlediği anı** gösterir (5–6. adımda RPC'den okunduğu an); zincir saati ayrıca "Ledger kapanışı" olarak yazılır.

### 9.2. "Havuz 1" terimi — `pool1Address` ile KARIŞTIRILMAMALI

Panel ve dokümantasyon dilinde:

- **Havuz 1 (Esnaf Kasası)** — %99,6, `pay_merchant` ile doğrudan **esnafın kendi adresine** gider. "Kendi paranı kendin tutarsın, biz banka gibi saklamayız" ilkesinin karşılığıdır. Panelde kutunun içinde işletme adı ve zincirdeki esnaf adresi gösterilir.
- **Havuz 3 (Sosyal Fon)** — %0,1
- **Havuz 4 (Operasyonel)** — %0,3

Koddaki `config.pools.pool1Address` / `POOL1_ADDRESS`, v1 `distribute()` fonksiyonundan kalma, **bu akışta kullanılmayan ayrı** bir adrestir (§7). Ona dokunulmamıştır; panelde hiç gösterilmez. Dağılım dallarının adresleri config'ten değil, zincirdeki `transfer` olaylarının alıcısından okunur (`contract-events.service.test.js` bunu ayrıca doğrular). Yüzdeler panelde sabit yazılmaz, zincirdeki tutarlardan hesaplanır.

### 9.3. Neden Soroban RPC — deneme sonuçları (15 Eylül 2026)

Uygulamadan önce gerçek ödeme `b5466573…` üzerinde salt-okunur bir deneme yapıldı:

| Kontrol | Sonuç |
|---|---|
| Horizon işlem kaydında kontrat olayları | **Yok** — `result_meta_xdr` alanı kaldırılmış |
| RPC `getTransaction(dış fee-bump hash)` | `SUCCESS`, 316 ms, `events.contractEventsXdr` içinde 4 olay |
| RPC `getTransaction(iç hash)` | O da `SUCCESS` |
| `pay_merchant` başlık kodlaması | **ScString** — ScSymbol filtresi 0 olay döndü (`merchant-chain.service.js`'teki `transfer` tuzağının aynısı) |
| RPC saklama penceresi | 120.960 ledger (~7 gün) |
| Horizon–RPC ledger farkı | 6 ölçümde 0 |

Sonuçlar:
- Olaylar gönderimden hemen sonra okunup Mongo'ya yazılır; ~7 günden eski bir işlem için 5–6. adım "RPC'de bulunamadı" olarak dürüstçe gösterilir.
- RPC işlemi henüz indekslemediyse 10 sn'ye kadar 1 sn arayla yeniden denenir. **Gerçek gecikme henüz canlıda ölçülmedi.**
- Testler uydurma olaylarla değil, bu işlemin kaydedilmiş ham XDR'ıyla (`orchestrator/test/fixtures/pay-merchant-b5466573.json`) yazıldı. Dağılım tutarları `Transaction.pool1Amount/pool3Amount/pool4Amount` alanlarına da artık yazılıyor (önceden hiç doldurulmuyordu).

### 9.4. Taşıma ve erişim

- **`GET /api/v1/flow/stream`** — Server-Sent Events. Açılışta `snapshot`, her yeni olayda `flow` (işlemin güncel tam görüntüsü). 20 sn'de bir kalp atışı. Panel her zaman en yeni işlemi takip eder.
- **`GET /api/v1/flow/latest`** — anlık görüntü (JSON).
- **`FLOW_PANEL_TOKEN`** — `?token=` ile gelir (EventSource başlık gönderemez), sabit zamanlı karşılaştırılır. Boşsa uçlar **503** döner, panel kapalıdır. Gösterilen veriler zaten zincirde açık (hash, adres, tutar) + işletme adı; token rastgele tarayıcıları dışarıda tutan bir bariyerdir, gizli bir finansal yetki değildir.
- IP bazlı rate limit (`RATE_LIMIT_FLOW_READ_*`, 60/dk) ve eşzamanlı yayın sınırı (`FLOW_PANEL_MAX_STREAMS`, 20).
- Yayın süreç içi `EventEmitter` iledir — **tek instance varsayımı**. Olaylar Mongo'da kalıcı olduğu için panel yenilense veya servis uyuyup uyansa zaman çizelgesi kaybolmaz.
- Sunucu kapanışında açık yayınlar kapatılır (aksi halde `server.close()` onları sonsuza dek beklerdi).

### 9.5. Ödeme yolunu bozmama garantileri

- `recordFlowEvent()` hata fırlatmaz ve ödeme yolu onu **beklemez**; olaylar işlem başına bir söz zinciriyle sırayla yazılır.
- Akış yazmaları `timestamps: false` ile yapılır — `updatedAt` işin durumunu yansıtmaya devam eder; aksi halde her olay mutabakatın "yeterince eski mi" kontrolünü sıfırlayıp onayı geciktirirdi.
- İşlem zincire kabul edildikten sonra oluşan bir DB/idempotency hatası 4. adımı "başarısız" gösteremez.
- Aynı işlem hem SSE hem mutabakat tarafından yakalanırsa 7–8. adım akışa ikinci kez yazılmaz.

### 9.6. Mutabakat 10 saniyeye indirildi — ~~güncel değil~~, bkz. §9.9

Bu bölüm 15 Eylül 2026'daki ilk hâliyle bırakıldı (tarihsel kayıt); **17 Eylül 2026'da §9.9 ile geçersiz kılındı** — mutabakatın 8-20 sn'lik gecikmesi artık normal akışın parçası değil. Aşağıdaki orijinal metin: "Canlı Render'da SSE hiç mesaj almadığı için (§6.4.1) onayı fiilen mutabakat yakalıyor. 7. adımın demoda makul sürede işaretlenmesi için `render.yaml`'da `RECONCILIATION_CRON="*/10 * * * * *"` ve `RECONCILIATION_MIN_AGE_MS=8000` yapıldı."

### 9.7. Doğrulama durumu

- **Doğrulanan:** 190/190 orchestrator testi (23 yeni: gerçek RPC XDR'ıyla olay çözümleme, sıra garantisi, uçtan uca submit akışı 1–6. adım, ön-simülasyon hatasında 3. adım, mutabakat kaynağı, ack ucu yetki/idempotentlik, SSE yayını). Panel; bellek-içi Mongo + gerçek uçlar + gerçek işlem verisiyle Chrome'da 1080p (tam akış tek ekrana sığıyor), "bekleniyor", hata ve 400 px genişlik durumlarında görsel olarak kontrol edildi.
- **DOĞRULANMADI:** Canlı Render'da gerçek bir ödemeyle uçtan uca çalışma, RPC indeksleme gecikmesi, SSE yayınının Render/Cloudflare üzerinden tamponlanmadan geçmesi ve esnaf istemcisinin ack çağrısı (client'ta test altyapısı yok; değişen dosyalar yalnızca sözdizimi olarak kontrol edildi).

### 9.8. Canlıya alma adımları

1. Render → Environment: `FLOW_PANEL_TOKEN` gir (uzun rastgele değer). Servis Blueprint ile değil elle kurulduysa `RECONCILIATION_CRON=*/30 * * * * *` ve `RECONCILIATION_MIN_AGE_MS=20000` değerlerini de elle güncelle (§9.9 — artık hız-kritik değil).
2. Deploy sonrası `https://kalem-5i08.onrender.com/flow?token=…` aç — "Canlı" rozeti yeşil olmalı.
3. Bir ödeme yap; adımların sırayla işaretlendiğini, 7. adımın kaynağının `submit_response` olduğunu (mutabakat DEĞİL) ve toplam gecikmenin saniyeler mertebesinde olduğunu doğrula.

---

## 9.9. Onay (7. adım) neden 15-20 saniye sürüyordu — kök neden ve düzeltme (17 Eylül 2026)

### Bulgu

`stellar-tx.service.js`'teki `submitTransaction()`, Horizon'un **klasik** `submitTransaction()` uç noktasını kullanıyor — bu uç nokta **SENKRON'dur**: çağrı, işlem ledger'a yazılana kadar Horizon içeride bekler, sonra `hash` VE `ledger` numarasını doğrudan döndürür. Yani `submitTransactionHandler` içinde, Horizon'dan `response` döndüğü an, işlemin zincirde **gerçekten onaylandığının** kanıtı **zaten elimizdeydi** (4. adım — "Zincire iletildi"). Önceki kod bu bilgiyi kullanmıyor, 7. adımı ("Onaylandı") SSE'ye (Render'da canlıda güvenilmez, bkz. §6.4.1) ya da 10 saniyelik mutabakat turuna bırakıyordu — tamamen gereksiz bir bekleme.

### Düzeltme

`submitTransactionHandler`, Horizon'un senkron cevabı döndüğü anda `sse-listener.service.js`'teki `handleTransaction()`'ı **doğrudan, HTTP cevabını beklemeden (fire-and-forget)** çağırır (`source: 'submit_response'`). Bu fonksiyon zaten SSE ve mutabakatın da çağırdığı AYNI koddur — kod tekrarı yok, yalnızca üçüncü (ve neredeyse her zaman en hızlı) bir çağıran eklendi.

### Ortaya çıkan yarış durumu ve atomik düzeltme

Artık aynı işlem için üç yol (doğrudan çağrı / SSE / mutabakat) neredeyse aynı anda `handleTransaction()`'ı çağırabilir. Önceki kod bunu `firstCatch` adlı bir "en iyi çaba" bayrağıyla önlüyordu — okuma (`findOne`) ile yazma (`save()`) arasındaki pencerede iki çağrı da "ben ilkim" sanıp **iki ayrı GİB belgesi** üretebilirdi (gerçek Mongo'da doğrulanan bir risk, bkz. `test/handle-transaction-race.service.test.js`). Düzeltme: durum güncellemesi artık **atomik** — `Transaction.findOneAndUpdate({..., status: {$ne: 'confirmed'}}, {$set: {...}})`. Üç çağrıdan yalnızca biri eşleşir ve "kazanır"; diğerleri `null` döner ve güvenle hiçbir şey yapmaz (GİB belgesi tekrar üretilmez, akışa 'caught'/'gib' tekrar yazılmaz).

### Mutabakat artık gerçek bir emniyet ağı

`RECONCILIATION_CRON` 10 sn → **30 sn**, `RECONCILIATION_MIN_AGE_MS` 8 sn → **20 sn**'ye gevşetildi (render.yaml, `.env.example`). Bu job artık yalnızca "doğrudan çağrı da SSE de başarısız oldu" (ör. süreç Horizon cevabından hemen sonra çöktü) nadir durumu için devrede kalır.

### Test kapsamı ile doğrulandı

- `test/handle-transaction-race.service.test.js` (yeni): gerçek (bellek-içi) MongoDB'ye karşı üç çağrıyı **GERÇEKTEN eşzamanlı** (`Promise.all`, sıralı `await` DEĞİL) tetikleyip yalnızca birinin kazandığını, GİB belgesinin TAM OLARAK bir kez üretildiğini kanıtlar.
- `test/transaction.submit.integration.test.js`: gerçek submit akışında 'submitted'→'caught' arasının **2 saniyenin altında** olduğunu doğrudan ölçer (ölçülen: ~100ms, eskiden 15-20 sn).
- Bulunan ek gerçek: `submitted` sonrası iki BAĞIMSIZ zincir (RPC okuması → contract/distribution; doğrudan onay → caught/gib) paralel koşuyor — aralarındaki SIRA garantili değil (ağır yükte ters sırada bitebildiği tam test paketinde gözlemlendi). Test bunu katı sıra yerine her zincirin kendi içindeki sırayı kontrol edecek şekilde güncellendi.
- 193/193 orchestrator testi, art arda 3 tam paket çalıştırmasında kararlı (flaky değil) PASS.

### Sonuç

Uçtan uca (imza → onay + GİB) süre, 15-20 saniyeden **saniyenin altına** indi. SSE dinleyicisi değişmedi (hâlâ ikinci bir yol); 1-6. adımların süresi değişmedi (zaten hızlıydı).

## 9.10. Ödeme yolunda ikinci hız turu — sıralı işlerin kaldırılması (18 Eylül 2026)

**Taban:** Horizon `submitTransaction` ledger kapanışını bekler (3–6 sn) — indirilemez. Geri kalan ~1,5–3 sn'lik kısım gereksiz sıralı iş/tekrardı. Aşağıdaki süreler kod incelemesinden **TAHMİNDİR, canlıda ölçülmedi**.

| | Değişiklik | Tahmini kazanç |
|---|---|---|
| A | Submit yanıtı `txHash` + `ledger` döner; client artık Horizon'u ayrıca yoklamaz (eski yanıt biçiminde yoklama geri dönüş olarak duruyor) | 0,2–0,5 sn (Horizon geciktiğinde +2,5 sn riski de biter) |
| C | `Transaction.create`, ön-simülasyonla paralel; `wrapAndSubmitFeeBump` yeni `beforeSend` kapısıyla Horizon'a göndermeden önce kaydın yazıldığını GARANTİ eder (kayıt yazılamazsa ağa hiç gidilmez — test var) | 1 Mongo yazması |
| D | `transaction.save()` ile `finalizeIdempotencyKey` paralel. **Yanıtı finalize'dan ÖNCE göndermek reddedildi:** hızlı yeniden deneme replay (200) yerine 409 alırdı | 1 Mongo yazması |

**Yapılmadı / kalan:** (B) onay ekranındayken işlemi önceden kurup prepare etme (0,5–1,2 sn; timebound/sequence eskimesi nedeniyle ayrı iş). Ön-simülasyonu kaldırmak REDDEDİLDİ (Havuz 2 "bedava gaz" koruması). **Bölge kontrolü:** `render.yaml`'da `region` yok (Render varsayılanı); Atlas bölgesi panelden doğrulanmalı — kritik yolda hâlâ 3 sıralı/paralel Mongo yazması var.

**Doğrulama durumu:** 194/194 orchestrator testi (3 art arda çalıştırma). Client değişikliği (`PaymentScreen.js`) test altyapısı olmadığı için **çalıştırılmadı** — canlıda bir ödemeyle doğrulanmalı.

