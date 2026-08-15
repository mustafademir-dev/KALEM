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

### 6.1. Kalıcı MongoDB — ~~Gerekiyor~~ TAMAMLANDI

Sistemin Madde 3/5 E2E doğrulamaları `mongodb-memory-server` ile yapılmıştı — bu, yalnızca test/doğrulama script'leri için süreç içinde başlatılan **geçici, bellek-içi** bir MongoDB'dir; süreç kapanınca tüm veri kaybolur. Gerçek çalışan sistem için MongoDB Atlas'ta kalıcı bir cluster kurulup bağlanmıştır ve gerçek bir kayıtla doğrulanmıştır:

- `orchestrator/.env`'deki `MONGODB_URI` gerçek bir Atlas cluster'ına işaret ediyor. `config/index.js`'in bunu doğru okuduğu teyit edildi (kimlik bilgileri her zaman maskelenerek gösterildi, hiçbir zaman düz metin loglanmadı/commit edilmedi).
- **Tespit edilen ortam sorunu:** Bu makinede Node'un DNS çözücüsü (`dns.getServers()` → `127.0.0.1`, muhtemelen yerel bir VPN/antivirüs DNS müdahalesi) `mongodb+srv://` bağlantı dizesinin gerektirdiği SRV DNS kaydını `ECONNREFUSED` ile reddediyordu — Windows'un kendi `nslookup`'ı aynı kaydı sorunsuz çözüyordu, yani DNS kaydının kendisi değil, Node'un bu makinedeki DNS yapılandırması sorunluydu. **Çözüm:** Atlas'ın standart (SRV olmayan) `mongodb://host1,host2,host3/...` formatına geçildi — bu format SRV DNS sorgusuna hiç ihtiyaç duymadığı için bu sınıf soruna karşı kalıcı olarak daha sağlamdır, yalnızca bu makineye özel bir yama değildir.
- Sunucu (`node src/index.js`) gerçekten başlatılıp log'da `[MongoDB] Bağlantı başarılı.` ile Atlas'a bağlandığı doğrulandı; ardından SSE dinleyicisi ve pool-feeder cron'u da sorunsuz başladı.
- Gerçek bir üye işyeri kaydı (`POST /merchants/register`) çalışan sunucu üzerinden oluşturuldu; **tamamen bağımsız, yeni bir mongoose bağlantısıyla** (aynı process'in önbelleği değil) sorgulanıp kaydın gerçekten Atlas'ta kalıcı olduğu doğrulandı, ardından test kaydı temizlendi.
- **Not:** `MONGODB_URI`'de veritabanı adı belirtilmediği için bağlantı varsayılan `test` veritabanına düşüyor (`mongoose.connection.name === 'test'`) — işlevsel bir sorun değildir ama istenirse URI'nin sonuna `/kalem` eklenerek netleştirilebilir; bu operasyonel bir tercih olduğu için burada yalnızca not düşülmüştür, otomatik değiştirilmemiştir.

### 6.2. Rate Limiting (İstek Sıklığı Sınırı) Yok

`POST /transactions/submit` artık `authMiddleware` ile korunuyor, ancak kimliği doğrulanmış **tek bir üye işyeri**, ardışık farklı işlemlerle Havuz 2'yi işlem başına `config.feeBump.maxTotalFeeStroops` (varsayılan ~1 XLM) limitine kadar defalarca tüketebilir — hiçbir istek sıklığı sınırı (`express-rate-limit` veya benzeri bir middleware) yoktur. Mevcut kısmi korumalar: `authMiddleware` (yalnızca kayıtlı işyerleri), işlem başına mutlak ücret tavanı (`maxTotalFeeStroops`), kontrat beyaz listesi (`allowedContractIds`), iç zarf başına tek operasyon sınırı (`maxInnerOperations=1`). Bunların hiçbiri istek **sıklığını** sınırlamaz. Ayrı bir güvenlik iş paketi olarak listelenmelidir. **Bu henüz yapılmamıştır.**

### 6.3. `orchestrator/.env` Operasyonel Süreci Netleşmedi

`.env` dosyası `.gitignore`'dadır ve `POOL2_SECRET_KEY`/`ISSUER_SECRET_KEY` gibi gizli anahtarları içerir; repoda hiçbir zaman bulunmaz. Gerçek testnet işlemi gönderebilmek için bu dosyanın doldurulmuş olması gerekir. Anahtarların kimin tarafından, hangi güvenli kanaldan sağlanacağı (örn. HSM, secret manager, elle) operasyonel olarak henüz tanımlanmamıştır — bkz. Bölüm 5.1 "Yan not — ihraççı clawback yetkisi" ile aynı üretim-öncesi sertleştirme kapsamı.

### 6.4. SSE Dinleyicisinde Kalıcı Cursor / Reconciliation Yok

Madde 5 (`sse-listener.service.js` havuz filtresi düzeltmesi) sırasında incelenmiştir. `@stellar/stellar-sdk`'in `stream()` implementasyonu (`horizon/call_builder.js`) kısa süreli ağ kesintilerine karşı makul bir koruma sağlar: her mesajda sıfırlanan 15 saniyelik bir durgunluk (staleness) sayacı bağlantıyı otomatik kapatıp yeniden açar, alttaki `EventSource` de kendi native retry'ını çalıştırır, ve son işlenen `paging_token` bellekte tutulup yeniden bağlanırken kullanılır — yani saniyeler-dakikalar süren kesintilerde veri kaybı olmaz.

**Ancak iki gerçek boşluk var:**
- **Sabit 15sn retry aralığı, exponential backoff yoktur** — uzun süreli bir Horizon kesintisinde sistem aralıksız denemeye devam eder, hız kesme/geri çekilme mantığı yoktur.
- **Kalıcı cursor yoktur (asıl önemli olan bu):** `startSSEListener()` her çağrıldığında `.cursor('now')` ile sıfırdan başlar; cursor hiçbir yerde (DB'de) saklanmaz. Orkestrasyon süreci yeniden başlarsa (deploy, crash, restart) — o pencerede zincire yazılan ama henüz yakalanmamış bir onay **kalıcı olarak kaçırılır**. Hiçbir reconciliation/backfill job'ı `'submitted'` durumunda takılı kalan işlemleri sonradan Horizon'dan sorgulayıp düzeltmiyor; `/health` endpoint'i de SSE bağlantı durumunu yansıtmıyor — dolayısıyla bu durum operasyonel olarak fark edilmeyebilir.

**Öneri (üretim öncesi yapılmalı, bu iş paketinin kapsamı dışında bırakıldı):** son işlenen cursor'ı MongoDB'de kalıcı tutmak, sunucu başlangıcında oradan devam etmek; ayrıca periyodik bir reconciliation job'ı ile belirli bir süreden uzun `'submitted'` durumunda kalan işlemleri Horizon'dan tekil sorgulayıp durumlarını düzeltmek (SSE'nin bir yedeği olarak). **Bu henüz yapılmamıştır.**

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

