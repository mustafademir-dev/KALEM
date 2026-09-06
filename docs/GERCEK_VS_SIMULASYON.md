# KALEM — Neler Gerçek, Neler Simülasyon

> Bu belge tek bir soruya cevap verir: **"Bu sistem gerçekten çalışıyor mu, yoksa simülasyon mu?"**
>
> Cevap ikisi de değil, ikisi birden: **ödeme altyapısının teknik çekirdeği gerçektir ve canlı zincirde doğrulanabilir; sistemin dış dünyayla (banka, vergi idaresi, kimlik doğrulama) temas ettiği noktalar simüledir.** Aşağıda bu sınır, iddia bazında ve kanıtla ayrılmıştır.
>
> Bu ayrım TEKNOFEST sunumunda doğrudan kullanılabilir. Belgedeki her "gerçek" iddiası, proje dokümantasyonuna güvenilerek değil **canlı ağa sorularak** doğrulanmıştır (bkz. §1).

---

## 1. Bağımsız Doğrulama (6 Eylül 2026)

Bu belgedeki iddialar, canlı Stellar testnet'ine bağımsız sorgu atılarak yeniden doğrulanmıştır. Ham çıktılar aşağıdadır.

### 1.1. İşlem gerçekten ledger'da mı?

`GET https://horizon-testnet.stellar.org/transactions/ba2c5df4...`

```
successful:   True
ledger:       4147747
created_at:   2026-08-15T02:17:52Z
fee_account:  GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK   (Havuz 2)
source:       GDGXPJHY7J23KUOXERCXXGRJRJOKLF7OPKSIQ37Q6BOQLHYQJHJT4EDY   (müşteri)
```

**Bu tek çıktı Fee-Bump'ı ispatlar:** işlemin **kaynağı müşteri**, **ücretini ödeyen Havuz 2**. İki alan farklı hesaplardır. Müşteri hiç XLM'e dokunmadan ödeme yapmıştır — mimarinin en kritik iddiası, taklit edilmesi mümkün olmayan bir ledger kaydıyla doğrudur.

### 1.2. Çağrılan fonksiyon gerçekten `pay_merchant` mı?

`GET .../transactions/ba2c5df4.../operations`

```
type:     invoke_host_function
function: HostFunctionTypeHostFunctionTypeInvokeContract
params:   [Address: pool-manager] [Sym: "pay_merchant"] [Address: müşteri] [Address: esnaf] [I128: 10000000]
```

`I128 = 10.000.000` stroops = **1,0000000 dTL**. Veritabanına yazılmış simüle bir kayıt değil, zincire yazılmış bir kontrat çağrısıdır.

### 1.3. Para gerçekten dağıldı mı? (canlı bakiye sorgusu)

`readContractBalance()` ile dTL kontratına (`CC6TSYYO...`) canlı Soroban RPC sorgusu:

| Hesap | Canlı bakiye (stroops) | Yorum |
| :--- | ---: | :--- |
| Esnaf (test) | `9.960.000` | 1 dTL ödemenin **%99,6**'sı |
| Havuz 3 (Sosyal) | `28.500` | tüm test hacminin **%0,1**'i |
| Havuz 4 (Operasyonel) | `85.500` | tüm test hacminin **%0,3**'ü |
| Havuz 1 (Likidite) | `0` | v2'de müşteri→esnaf akışında kullanılmaz — **beklenen** |

**En güçlü kanıt buradadır:** Havuz 3 ve Havuz 4 bakiyeleri arasındaki oran **tam olarak 1:3**'tür (`28.500 × 3 = 85.500`). Bu, `kalem-shared::calculate_distribution()` içindeki `1/1000` ve `3/1000` sabitlerinin gerçekten zincirde uygulandığı anlamına gelir; iki bağımsız hesabın bakiyesinin tesadüfen bu oranı tutturması mümkün değildir. İki bakiyeden geriye çalışıldığında sistemden geçmiş toplam hacim `28.500.000` stroops = **2,85 dTL** olarak bulunur ve her iki bakiyeyle de tutarlıdır.

Havuz 1'in `0` olması bir eksiklik değil, **v2 tasarımının doğrulanmasıdır**: `pay_merchant()` kalan payı Havuz 1 yerine esnafa yönlendirir (bkz. `ARCHITECTURE_DECISIONS.md` §7.3).

### 1.4. Esnaf kaydı gerçekten zincirde mi?

```
is_merchant(GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B) -> true
```

MongoDB'deki bir bayrak değil, kontrat storage'ından okunan gerçek zincir durumudur.

### 1.5. Test durumu

`orchestrator/` test paketi bu doğrulama sırasında yeniden çalıştırıldı: **133/133 PASS**. Kontrat tarafındaki Rust birim testleri için bkz. `ARCHITECTURE_DECISIONS.md` §3.B ve §8 — bunlar bu doğrulama oturumunda yeniden çalıştırılmamıştır (WSL2 derleme ortamı gerektirir).

---

## 2. GERÇEK Olan Katmanlar

Aşağıdakilerin hiçbiri mock, stub veya sahte veri değildir. Hepsi gerçek kriptografi ve gerçek ağ üzerinde çalışır.

| Bileşen | Neden gerçek |
| :--- | :--- |
| **Gözetimsiz cüzdanlar** | Gerçek Ed25519 anahtar çiftleri. Gizli anahtar sunucuya **hiç gönderilmez**; imzalama tamamen cihazda olur (`client/src/services/wallet.service.js`). |
| **Müşteri imzası** | İç zarf (`signedXdr`) müşterinin kendi anahtarıyla imzalanır; orkestrasyon katmanı bu imzayı **değiştirmez**, yalnızca dış zarfa sarar. |
| **Fee-Bump (CAP-0015)** | §1.1'de ispatlandı: `fee_account ≠ source`. Havuz 2 gerçek XLM harcar (§7.5'te ölçülen fark: `0,0219823` XLM). |
| **Soroban kontratları** | `dtl-token` ve `pool-manager` testnet'e gerçekten deploy edilmiştir; contract ID'leri `ARCHITECTURE_DECISIONS.md` §4.A ve §7.2'de kayıtlıdır ve herkes tarafından explorer üzerinden doğrulanabilir. |
| **Atomik çok taraflı dağılım** | `pay_merchant()` tek bir Soroban invocation içinde üç ayrı `transfer()` çağırır. Biri başarısız olursa **Soroban runtime tüm state'i geri alır** — esnafa kısmi ödeme yapılması yapısal olarak imkânsızdır. Oranlar §1.3'te canlı bakiyeyle doğrulandı. |
| **Kapalı devre güvenlik** | Esnaf-gönderemez guard'ı (`MerchantCannotSend`, hata #8) gerçek ağda, gerçek bakiyeye sahip gerçek bir esnaf hesabıyla **negatif kanıtla** doğrulandı (§7.5). SEP-41'in `approve`/`transfer_from` fonksiyonları bilinçli olarak devre dışıdır (§2). |
| **Idempotency** | Mükerrer çekim koruması gerçek testnet işlemiyle kanıtlandı (commit `93e1c2c`); aynı `Idempotency-Key` ile ikinci bir tx **gönderilmez**. |
| **SSE onay yakalama** | Horizon stream'inden gerçek onay yakalandı (tx `74d5e7c8...`, ~2 saniyede) ve GİB belge üretimi zincirleme tetiklendi (commit `ba5ec82`). |
| **Kalıcı veritabanı** | MongoDB Atlas — gerçek, kalıcı bir cluster (§6.1). Bellek-içi test veritabanı değildir. |

---

## 3. SİMÜLASYON Olan Katmanlar

Bunlar PoC kapsamında **bilinçli olarak** simüle edilmiştir; hepsi lisans, kurumsal erişim veya düzenleyici onay gerektirdiği için bir yarışma projesinde gerçeklenemez. Her biri için "gerçek hayatta yerini ne tutar" ayrıca yazılmıştır.

### 3.1. Para gerçek para değildir — en önemli madde

`STELLAR_NETWORK=testnet`. dTL, **Stellar testnet'inde** ihraç edilmiş bir Soroban custom token'dır. **Gerçek TL karşılığı yoktur, mainnet'te dağıtılmamıştır, hiçbir mali değeri yoktur.**

> Sistem gerçek, üzerinde dönen değer gerçek değil.

### 3.2. Paranın sisteme girişi (PSP / tahsilat) — simüle

"Bakiye Yükle" iki simüle adımdan oluşur (§6.7):

1. **Friendbot** ile testnet hesabı fonlama — *mainnet'te karşılığı yoktur*. Gerçek dağıtımda bu adım tamamen kaldırılıp yerine sponsorlu hesap oluşturma veya kullanıcının kendi XLM'i ile fonlama konmalıdır.
2. **`POST /api/v1/faucet/mint`** — müşteri, adres sahipliğini imzayla kanıtlayarak kendine sabit miktarda dTL bastırır.

**Gerçek hayat karşılığı:** Lisanslı bir ödeme kuruluşunun (PSP) gerçek tahsilat/para yatırma işleminden sonra tetikleyeceği "hesaba dTL ekleme" adımı. Şu an müşteri **hiçbir gerçek para hareketi olmadan kendi kendine para basabilmektedir** — yalnızca testnet/demo kapsamında kabul edilebilir. `POST /faucet/mint` mainnet dağıtımında **tamamen kaldırılmalıdır**.

### 3.3. GİB e-Belge entegrasyonu — tamamen simüle

Canlı GİB API'lerine erişim yoktur. `gib-simulator.service.js`, ÖKC protokolüne ve **UBL-TR 2.1** standardına uygun bir JSON/XML belge taslağı üretip MongoDB'ye yazar (`status: 'generated'`).

**Format doğrudur, ancak hiçbir belge gerçekten GİB'e iletilmez.** Üretilen fiş client'ta gerçek bir belge gibi görüntülenebildiği için, sunumda bunun bir taslak olduğu açıkça belirtilmelidir.

### 3.4. KYC/KYB kimlik doğrulaması — yok

Esnaf kaydında **adres sahipliği** gerçek bir Ed25519 imzasıyla gerçekten kanıtlanır (`ownershipVerified: true`) — bu kısım gerçektir. Ancak "bu kişi gerçekten bu işletmenin yetkilisi mi, bu VKN ona mı ait" sorusunu soran bir süreç **yoktur**; onay, operatörün elle çalıştırdığı `orchestrator/scripts/approve-merchant.mjs` script'iyle verilir.

**Gerçek hayat karşılığı:** Bankaların/PSP'lerin üye işyeri sözleşmesi öncesinde yürüttüğü belge ve kimlik doğrulama süreci.

### 3.5. Havuz 4 → Havuz 2 ekonomik döngüsü — yarım (bilinçli)

Şu anki ayar: **`DEMO_MODE=false`**.

- Havuz 4'ün dTL'sinin **yakılması (burn) gerçekten yapılır** — gerçek bir on-chain işlemdir.
- Ancak karşılığındaki **XLM enjeksiyonu otomatik yapılmaz**; `PoolFeed` kaydı `awaiting_offchain` durumunda, `"MANUEL ONAY BEKLENİYOR"` damgasıyla bekler.

Bu bir eksiklik değil, **bilinçli bir dürüstlük kararıdır** (§5.2): olmayan bir döviz dönüşümünü otomatik taklit etmek, testnet'te gerçek olmayan bir "1:1 karşılık" görüntüsü verirdi. `DEMO_MODE=true` yapıldığında enjeksiyon otomatikleşir, ancak her kayıt `"SİMÜLE KUR (DEMO_MODE)"` damgası taşır — hangi modda çalışıldığı hiçbir kayıtta belirsiz kalmaz.

**Sonuç:** ekonomik döngü şu an kendi kendine kapanmıyor; kapanması için elle bir operasyonel adım gerekiyor.

### 3.6. Sistem henüz internette değil

Backend yalnızca `localhost:3000` üzerinde çalışır. Çalışan bir sistemdir, ancak şu an **yalnızca geliştirme makinesinde**. Bulut host'a taşıma, §8'deki "Sıradaki adımlar" listesinin 1. maddesidir.

---

## 4. Jüri Sorusuna Hazır Cevap

Aşağıdaki iki paragraf olduğu gibi kullanılabilir ve tamamen doğrudur:

> **Ödeme altyapısının kendisi gerçek ve çalışıyor.** Gerçek blokzincir, gerçek kriptografik imzalar, gerçek gözetimsiz cüzdanlar, gerçek atomik dağılım ve gerçek işlem ücreti sponsorluğu. Zincire yazdığımız işlemler, herkesin bağımsız olarak doğrulayabileceği şekilde Stellar testnet ledger'ında duruyor — dağılım oranlarımızın doğruluğu, iki ayrı havuz hesabının canlı bakiyesinin birbirine tam 1:3 oranında olmasıyla kanıtlanabilir.
>
> **Sistemin dış dünyayla temas ettiği noktalar simüle:** para girişi (ödeme kuruluşu tahsilatı), vergi entegrasyonu (GİB), kimlik doğrulama (KYC/KYB) ve döviz dönüşümü. Bunlar bir PoC'de zaten simüle edilir, çünkü hepsi lisans veya kurumsal erişim gerektirir. Simüle ettiğimiz her noktayı belgeledik ve gerçek dağıtımda yerine ne konması gerektiğini yazdık.

**Bu bir demo videosu veya mock'lu prototip DEĞİLDİR** — teknik çekirdek gerçekten işliyor.

**Ancak "gerçek bir ödeme sistemi kurduk, yarın para alıp verebiliriz" de DEĞİLDİR** — mainnet dağıtımı, ödeme kuruluşu lisansı, gerçek GİB entegrasyonu ve gerçek KYC olmadan bu cümle kurulamaz.

---

## 5. Sunumda Dikkat Edilecek İfadeler

Aşağıdaki ifadeler teknik olarak yanlış olur; sağ sütundaki karşılıkları kullanılmalıdır.

| ❌ Söylenmemeli | ✅ Doğrusu |
| :--- | :--- |
| "Gerçek para transfer ediyoruz" | "Gerçek blokzincir üzerinde, testnet değeriyle transfer ediyoruz" |
| "GİB'e fiş kesiyoruz" | "GİB'in UBL-TR formatına uygun belge üretiyoruz; canlı API entegrasyonu PoC kapsamı dışında" |
| "Esnafları KYC'den geçiriyoruz" | "Esnafın cüzdan adresi sahipliğini kriptografik olarak doğruluyoruz; kurumsal KYC/KYB süreci kapsam dışı" |
| "Sistem canlıda çalışıyor" | "Sistem uçtan uca çalışıyor ve testnet'te doğrulandı; bulut dağıtımı sıradaki adım" |
| "Havuz döngüsü kendi kendine dönüyor" | "Burn otomatik; XLM enjeksiyonu bilinçli olarak manuel onaya bırakıldı (`DEMO_MODE=false`)" |

---

## 6. Çapraz Referanslar

- `ARCHITECTURE_DECISIONS.md` **§4** — testnet deployment, contract ID'leri, on-chain E2E dağılım sonuçları
- `ARCHITECTURE_DECISIONS.md` **§5.1 / §5.2** — burn sapması ve `DEMO_MODE` hibrit tasarımı
- `ARCHITECTURE_DECISIONS.md` **§6.7** — faucet ve Friendbot'un mainnet karşılıksızlığı
- `ARCHITECTURE_DECISIONS.md` **§7.5** — müşteri→esnaf gerçek testnet E2E doğrulaması ve negatif kanıt
- `ARCHITECTURE_DECISIONS.md` **§8** — devam noktası ve sıradaki adımlar
- `TESTNET_DEPLOYMENT.md` — deploy adımları ve hesap adresleri
