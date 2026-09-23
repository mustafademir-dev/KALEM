# KALEM — Sıfır Bilgi İspatı Katmanı

> **Kapsam: Sosyal Fon hak ediş ispatı. Para hareketi YOKTUR.**
> Bu katman bir kişinin sosyal destek almaya hak kazandığını, kimliğini ve
> gelir durumunu hiç açıklamadan kanıtlamasını sağlar. Kanıtın doğrulanması
> hak edişi tespit eder; **ödemenin kendisi bu katmanın dışındadır ve
> yapılmamıştır** (bkz. §"Neden para hareket etmiyor").

---

## 1. Problem

KALEM'de her ödemenin %0,1'i Havuz 3'te (Sosyal Destek Fonu) birikiyor.
Ama bir **dağıtım mekanizması yoktu** — o yüzden "burs dağıtıldı" gibi bir
iddia hiçbir zaman kurulmadı.

Dağıtım yapabilmek için kimin hak ettiğini bilmek gerekir. Bunu bilmenin
klasik yolu, insanlardan gelir belgesi, hane bilgisi, öğrenci belgesi
toplamaktır — yani KALEM'in bugüne kadar bilinçli olarak kaçındığı her şeyi
yapmak. Sistem müşteriden **hiçbir kişisel veri toplamıyor**: ad yok, e-posta
yok, telefon yok, TCKN yok.

Sıfır bilgi ispatı bu ikilemi çözen bilinen tek yoldur: **doğrulama yapılır,
veri toplanmaz.**

---

## 2. Ne kanıtlanıyor

> *"Yetkili kurumun yayımladığı hak sahipleri listesinde bir kaydım var, o
> kaydın sahibi benim, ve bu dönemde daha önce talepte bulunmadım."*

| Girdi | Görünürlük |
| :--- | :--- |
| `root` — kurumun yayımladığı hak sahipleri kökü | **Açık** |
| `period` — talep dönemi | **Açık** |
| `recipient` — talebi ileten taraf | **Açık** |
| `nullifierHash` — dönem bazlı tüketim damgası | **Açık (çıktı)** |
| `nullifier` — kişiye özel gizli değer | 🔒 Gizli |
| `secret` — kişiye özel gizli değer | 🔒 Gizli |
| `pathElements` / `pathIndices` — Merkle yolu | 🔒 Gizli |

Listedeki **hangi kayıt** olduğu da gizlidir — Merkle yolu açıklanmaz.

---

## 3. Nullifier — mahremiyet ve denetim aynı anda

```
nullifierHash = Poseidon(nullifier, period)
```

- Aynı kişi **aynı dönemde** ikinci kez talep ederse **aynı** değer çıkar → kontrat reddeder.
- Aynı kişi **sonraki dönemde** talep ederse **farklı** değer çıkar → talep geçerlidir.
- `nullifierHash`'ten kişiye geri gidilemez.

Zincir "bu kişi bu dönemde bir kez talep etti" bilgisini tutar, "bu kişi kim"
bilgisini tutmaz. Bu katmanın anlatmak istediği asıl fikir budur.

---

## 4. Akış

```
1. VATANDAŞ (cihazında)
   nullifier, secret üretir  →  commitment = Poseidon(nullifier, secret)
   Kuruma YALNIZCA commitment'ı verir. Gizli değerler cihazdan çıkmaz.

2. KURUM (off-chain)
   Hak edişi kendi yöntemleriyle değerlendirir (gelir, hane, sosyal inceleme)
   Hak edenlerin commitment'larından Merkle ağacı kurar
   Yalnızca KÖKÜ yayımlar — tek bir sayı; kaç kişi olduğunu bile açık etmez

3. VATANDAŞ (talep anında, tarayıcıda)
   Groth16 kanıtı üretir — gizli değerler yine cihazdan çıkmaz

4. ZİNCİR (Soroban kontratı)
   Kanıtı BLS12-381 host fonksiyonlarıyla doğrular
   nullifierHash daha önce kullanılmış mı bakar
   Geçerliyse kaydeder ve olay yayınlar
```

**Doğrulamayı bir kurum değil kontrat yapar.** Kimsenin "ben doğruladım, bana
güvenin" demesine gerek yoktur. Bir veritabanı bunu yapamaz — orada
doğrulamayı yapan taraf, güvenmeniz gereken taraftır.

---

## 5. Neden para hareket etmiyor

İki sebep, ikisi de bilinçli:

**(a) Teknik:** Havuz 3'ün gizli anahtarı orkestrasyon katmanında yok
(`.env` yalnızca `POOL2_SECRET_KEY` ve `ISSUER_SECRET_KEY` tutar). Ayrıca
`dtl-token.transfer()` alıcının kayıtlı havuz ya da kayıtlı esnaf olmasını
şart koşar — sıradan bir vatandaş ikisi de değildir. Yani Havuz 3'ten
vatandaşa doğrudan transfer **zaten mümkün değildir**. Mümkün olan tek yol
ihraççının `burn` + `mint` çiftidir ki bu da zincirin değil **ihraççının**
eylemidir; "kontrat parayı otomatik serbest bırakıyor" demek yanlış olurdu.

**(b) Kanıtı korumak:** Havuz 3 ile Havuz 4 bakiyelerinin oranı tam **1:3**'tür
ve bu, dağılım oranlarının gerçekten zincirde uygulandığının en güçlü
kanıtıdır (`docs/GERCEK_VS_SIMULASYON.md` §1.3). Havuz 3'ten para çıktığı anda
bu eşitlik bozulur.

Bu yüzden kapsam **hak ediş doğrulaması** ile sınırlandırılmıştır:
*"Mekanizmayı kurduk ve zincirde doğruladık; dağıtımı gerçekten yapmadık."*

---

## 6. Gerçek ne, simüle ne

| Bileşen | Durum |
| :--- | :--- |
| circom devresi | ✅ **Gerçek** |
| Groth16 kanıtı (BLS12-381) | ✅ **Gerçek** |
| Merkle üyelik kısıtı | ✅ **Gerçek** |
| Nullifier / çifte talep engeli | ✅ **Gerçek** |
| Kanıtın cihazda üretilmesi | ✅ **Gerçek** |
| Hak veren kurum | 🟡 **Simüle** — test verisiyle üretilmiş ağaç |
| Hak ediş kriteri | 🟡 **Kapsam dışı** — kurum off-chain karar verir |
| Güvenilir kurulum töreni | 🔴 **YAPILMADI** — aşağıya bakın |
| Gerçek destek dağıtımı | 🔴 **YOK** — §5 |

---

## 7. Güvenilir kurulum (trusted setup) — dürüst not

Groth16 devre başına bir kurulum gerektirir. Kurulumdaki gizli değer
("toxic waste") bilinirse **sahte kanıt üretilebilir**.

Yaygın uygulamada faz 1 için çok taraflı kamuya açık bir tören dosyası
kullanılır (Hermez / Perpetual Powers of Tau). **Ancak o tören BN254 eğrisi
içindir.** Biz BLS12-381 kullanmak zorundayız — çünkü Soroban'ın yerleşik
eşleşme fonksiyonları (CAP-0059) o eğri içindir ve on-chain doğrulamayı ancak
o eğriyle makul maliyete indirebiliyoruz.

Sonuç: **hem faz 1 hem faz 2 tek taraflı olarak, bu makinede üretilmiştir.**
Üretim kullanımında çok taraflı bir tören (MPC ceremony) zorunludur.
Bu, kanıtların matematiksel olarak geçersiz olduğu anlamına gelmez; kurulumu
yapan tarafa güvenmek gerektiği anlamına gelir.

---

## 8. Bilinen sapma — Poseidon sabitleri

circomlib'in Poseidon sabitleri BN254 skaler alanı için üretilmiştir
(bkz. `poseidon_constants.circom` dosya başlığı). Burada BLS12-381 alanında
kullanılıyorlar. İki alanın boyutu çok yakındır (254 ve 255 bit), bu nedenle
tur sayıları uygundur; ancak bu **kanonik bir Poseidon-BLS12-381 örneklemesi
değildir**. Üretimde sabitler hedef alan için yeniden üretilmelidir.

Aynı sebeple devre dışı hash hesabı (`lib/poseidon.mjs`) circomlibjs ile
değil, **derlenmiş devrenin kendisiyle** yapılır — iki tarafın aynı alanda
aynı sonucu üretmesi başka türlü garanti edilemezdi.

---

## 9. Neden imza değil, Merkle üyeliği

İlk tasarım kurumun EdDSA ile imzaladığı bir belgeydi. circomlib'in EdDSA'sı
**Baby Jubjub** eğrisi üzerinde çalışır ve Baby Jubjub BN254'ün skaler alanına
özgü tanımlanmıştır — BLS12-381 alanında karşılığı yoktur. Bu yüzden imza
şeması yerine, kurumun hak sahipleri kümesine ait bir Merkle kökü yayımladığı
tasarıma geçildi. Aynı yapı Stellar'ın kendi Privacy Pools prototipinde de
kullanılmıştır.

---

## 10. Öne geçme (front-running) koruması

Devrede `recipient` açık bir girdidir ve mantıkta kullanılmaz; tek amacı
kanıtı belirli bir talebe bağlamaktır. Groth16 kanıtı tüm açık girdilere
bağlı olduğundan, kanıtı mempool'dan kopyalayıp kendi adına gönderen biri
doğrulamayı geçemez.

> Not: Stellar'ın Privacy Pools prototipi bu korumayı **uygulamamış** olarak
> belgeliyor ("not yet implemented in main.circom"). Burada baştan eklendi.

---

## 11. Sınırlar

- **Anonimlik kümesi = hak sahibi sayısı.** Listede tek kişi varsa mahremiyet
  yoktur. Demo ölçeğinde küçüktür ve bu gizlenmemelidir.
- **Zamanlama korelasyonu.** Talebin ne zaman yapıldığı açıktır.
- **Kurum anahtarı.** Kurum sahte bir kök yayımlarsa hak sahibi olmayan
  birini listeye koyabilir. Üretimde kök yayını çok imzalı olmalıdır.

---

## 12. Yapı

```
zk/
├── circuits/
│   ├── support_eligibility.circom   Ana devre (DEPTH = 20)
│   └── poseidon2.circom             Devre dışı hash için yardımcı
├── lib/
│   ├── poseidon.mjs                 BLS12-381 alanında Poseidon
│   └── merkle.mjs                   Hak sahipleri ağacı
├── scripts/
│   ├── demo.mjs                     Uçtan uca senaryo
│   ├── export-for-soroban.mjs       snarkjs → Soroban bayt düzeni
│   └── emit-rust-fixtures.mjs       → contracts/support-verifier/src/fixtures.rs
├── artifacts/                       ⚠ REPOYA GİRER — aşağıya bak
└── build/                           Geçici çıktılar — repoya girmez
```

### `artifacts/` neden repoda

Testnet'teki kontrat bu doğrulama anahtarıyla başlatıldı ve `initialize`
yalnızca **bir kez** çağrılabilir — anahtar değiştirilemez. Bu dosyalar
kaybolursa yeniden üretmek işe yaramaz: yeni bir kurulum **farklı** bir
anahtar üretir ve onunla üretilen kanıtlar canlı kontratta doğrulanmaz;
kontratı yeniden deploy etmek gerekir, bu da mevcut işlem kayıtlarını ve
contract ID'yi değersizleştirir.

Yani bunlar "türetilebilir çıktı" değil, **canlı bir kontratla eşleşmek
zorunda olan sabitlerdir** (~11 MB).

| Dosya | Ne için |
| :--- | :--- |
| `se_final.zkey` | Kanıt üretimi (proving key) |
| `verification_key.json` | Zincir dışı doğrulama ve Soroban'a aktarım |
| `support_eligibility.wasm` | Ana devrenin witness üreteci |
| `poseidon2.wasm` + `poseidon2_witness_calculator.js` | Merkle ağacı için alan-doğru Poseidon |

`artifacts/` dizininin adı bilinçli olarak `build/` deseninin dışında
tutuldu: kök `.gitignore` `build/` dizinini komple dışlıyor ve **git
dışlanmış bir dizinin içine hiç bakmadığı için** alt seviyedeki istisnalar
orada çalışmazdı.

**Repoya GİRMEYENLER:**
- `build/ptau/*.ptau` — kanıt üretmek için gerekmiyor. Deneyle doğrulandı:
  ptau kaldırıldı, kanıt yine üretildi ve doğrulandı. Yalnızca yeni kurulum
  için gerekir, o da zaten farklı bir anahtar üretir. ~47 MB, faydası sıfır.
- `build/se_0000.zkey` — faz-2 katkısı öncesi ara dosya.
- **Deployer/admin gizli anahtarı** — `kalem-zk-keys/` altında, kullanıcının
  ev dizininde yedeklendi. Testnet anahtarı olduğu için para riski yok, ama
  bir blokzincir yarışmasında repoda commit'lenmiş gizli anahtar görünmesi
  kötü durur.

**Ödeme yoluna, mevcut kontratlara, client'a ve Render yapılandırmasına
hiçbir dokunuş yoktur.** Bu dizin tamamen eklemedir; kaldırılsa sistem
aynen çalışır.

---

## 13. CANLI DOĞRULAMA — Stellar testnet (23 Eylül 2026)

Aşağıdakilerin hepsi **gerçek ağda** yapıldı; yerel test ortamı değildir.

**Kontrat:** `CAK3OCQQ5RAOWPIYYW25SYINSOUXSH6MNWWMGRAVPXWTZRTEQHCUJZZG`
**Deployer:** `GA4UBEKFDZSKEUSYPTMO4SJ6M32VNTRGKJTD5KDFO5JGJCH3INIFJ2TO`
(yalnızca bu iş için üretilmiş yeni bir hesap — proje anahtarlarına dokunulmadı)

| Adım | İşlem |
| :--- | :--- |
| Deploy | [`57dc66e7…`](https://stellar.expert/explorer/testnet/tx/57dc66e753744e445edd428127cb27fe45e730a13d677d8df5c1fe8198156e73) |
| Doğrulama anahtarıyla başlatma | [`59282f58…`](https://stellar.expert/explorer/testnet/tx/59282f581391624fcf28f287c5b06aee2e685fa2b9628450487599a5467083b7) |
| Hak sahipleri kökünün yayımlanması | [`ba9adc7a…`](https://stellar.expert/explorer/testnet/tx/ba9adc7ae5511a2e13468f433a18ffc26c0eeefc3786649d8b08d6f06c43ce07) |
| **Hak ediş talebi — kanıt zincirde doğrulandı** | [`491bd40c…`](https://stellar.expert/explorer/testnet/tx/491bd40c922dd9833b4cb62d5ac83a1c5fbf75d764a5876c968b1505d204be69) |

### Talep işleminin yaydığı olay

```json
["claim", "3305766fe65c4cc400a9e7055178940bdc0f1fd26af2e5455f4ca37258b6b753"]
  ledger : 4826575
  period : 202603
  root   : 5c6956d36f9e947cab6c323b585990e6ddfa3e8c79815979855b208a05dd07a5
```

**Olayda kişiye dair tek bir alan yoktur.** Zincirde kalan iz: bir nullifier,
bir kök, bir dönem. Kimin talep ettiği yazmıyor — yazamaz da.

### Çifte talep canlıda reddedildi

Aynı talep ikinci kez gönderildiğinde:

```
HostError: Error(Contract, #404)   →  NullifierAlreadyUsed
is_nullifier_used(...) = true
```

Bu, mahremiyet ile denetimin aynı anda çalıştığının canlı kanıtıdır: zincir
"bu nullifier tüketildi" bilgisini tutuyor, "bu kişi kim" bilgisini tutmuyor.

### Ölçülen maliyet

Doğrulamanın CPU maliyeti **46.059.131 talimat** — işlem başına 100.000.000
sınırının **%46'sı**. `dogrulama_talimat_butcesine_sigar` testi bu sınırı
kalıcı olarak bekçiliyor; devre büyüyüp bütçeyi aşarsa test kırmızı yanar.

### Not — testlerdeki kanıt ile canlıdaki kanıt ayrıdır

`fixtures.rs` içindeki kanıt sabit test adresine (`GDE47HJ2…`) bağlıdır.
Testnet talebi ise deployer adresine bağlı **ayrı bir kanıtla** yapıldı.
Sebebi `recipient` bağlayıcısıdır: kanıt, onu kullanacak adrese bağlıdır ve
o adresin imzası olmadan talep geçmez (öne geçme koruması, §10). İkisi de
gerçek kanıttır; biri testlerde, diğeri zincirde doğrulanmıştır.
