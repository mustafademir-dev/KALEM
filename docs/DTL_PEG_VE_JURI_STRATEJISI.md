# dTL, Peg Sorusu ve Jüri Stratejisi

> **DURUM: 🟡 TARTIŞILACAK — HİÇBİR KARAR VERİLMEDİ.**
> Bu dosya 22 Eylül 2026 akşamı, oturum kapanınca kaybolmasın diye yazıldı.
> İçeriği bir plan değil, **üzerine geri dönülecek bir tartışma zemini**. Buradaki hiçbir
> cümle sunuma "onaylanmış metin" olarak girmedi; kullanıcı tek tek gözden geçirecek.
>
> Burada yazılanların hiçbiri koda dokunmaz. Kod tarafında iş çıkarsa
> `ARCHITECTURE_DECISIONS.md` §8.2'deki kalan işler listesine ayrıca eklenmelidir.

---

## 0. Bu dosya neden var — yeni ve belirleyici bilgi

**TEKNOFEST Blokzincir finalinin başhakemi, TCMB'nin Dijital Türk Lirası projesinin
yürütücülerinden biri.** Kullanıcı onunla birebir tanıştı ve **sorduğu ilk soru şuydu:
"TL ile nasıl birebir tutuyorsunuz?"**

Bu tek bilgi sunumun çerçevesini değiştiriyor:

- Peg sorusu artık "olası jüri sorularından biri" değil, **kesin gelecek ve sunumun
  kaderini belirleyecek soru.**
- Cevabın kalitesi, projenin teknik başarısından bağımsız olarak puanı belirleyebilir.
- Aynı kişi, projeye **en çok değer katabilecek** kişi de — çünkü bu projenin doğal
  devamı onun çalıştığı katman.

---

## 1. dTL şu anda teknik olarak ne? (kod gerçeği)

Zincirdeki hâliyle: **admin'i tek bir anahtar olan, kapalı devre bir Soroban custom
token'ı.** "TL" kontratın hiçbir yerinde tanımlı bir kavram değil — kontrat TL'yi bilmiyor.

| Gerçek | Kaynak |
| :--- | :--- |
| `initialize(name: "Dijital Türk Lirası Test", symbol: "dTL", decimal: 7)` | `docs/TESTNET_DEPLOYMENT.md:83` |
| 1 dTL = 10.000.000 stroop (kuruşun çok altında hassasiyet) | `decimal = 7` |
| Arz **yalnızca** `mint()` ile doğar, `burn()` ile ölür; ikisi de `require_admin` | `contracts/dtl-token/src/token.rs:178`, `:216` |
| `transfer()` alıcının kayıtlı 4 havuzdan biri olmasını şart koşar | `token.rs:310` |
| Esnaf gönderemez (`MerchantCannotSend`, hata #8) — gerçek ağda negatif kanıtla doğrulandı | `ARCHITECTURE_DECISIONS.md` §7.5 |
| `approve` / `transfer_from` bilinçli olarak devre dışı | `token.rs:408-418`, §2 |
| `total_supply()` zincirden herkese açık okunabiliyor | `token.rs:392` |
| Token adı `initialize` ile **bir kez** yazılır, `AlreadyInitialized` ile kilitlenir | `token.rs:131` |

---

## 2. Peg'in dürüst cevabı: şu anda birebir tutmuyoruz

**1 dTL = 1 TL bugün zincirde zorlanan bir değişmez değil, bir birim seçimi /
muhasebe varsayımı.** Kodda rezerv hesabı, teminat, oracle veya kanıt mekanizması yok.

Dahası peg'i tanımlayan kural aktif olarak ihlal ediliyor: `mint()`'in kendi
dokümantasyonu *"off-chain'de lisanslı kuruluşun bloke hesabına 1:1 TL yatırıldıktan
sonra tetiklenir"* diyor (`token.rs:172`), ama demo faucet'i hiçbir TL yatırılmadan
mint ediyor — müşteri kendi kendine 10 dTL basıyor
(`FAUCET_MINT_AMOUNT_STROOPS=100000000`).

### Ama tamamen boşlukta da değil — peg lehine gerçekten var olan üç şey

1. **Arz tekeli.** dTL tek bir ihraççı dışında kimse tarafından yaratılamaz.
   Kontrol edilebilir bir bilanço kalemi.
2. **Piyasası yok, dolayısıyla piyasa fiyatı da yok.** Kapalı devre tasarım sayesinde
   dTL borsada işlem göremez, üçüncü kişiye devredilemez. **Savunulacak bir kur yok.**
   Peg'in çöktüğü yer her zaman ikincil piyasadır; burada ikincil piyasa yapısal olarak
   imkânsız. Bu tesadüfi bir kısıt değil, peg'i korumanın en sağlam yolu — ve sunumda
   böyle anlatılmalı.
3. **İtfa yolu hazır.** `burn()` kontratta mevcut; arzı geri çekecek mekanizma duruyor.

### Bugünkü doğru cümle

> "dTL'nin karşılığı henüz yok; karşılığı olacak şekilde tasarlandı ve karşılığı tutmak
> için gereken zincir mekanizmaları (tekel mint, burn, arz görünürlüğü, kapalı devre)
> hazır."

---

## 3. O soru bir nezaket sorusu değil, bir eleme sorusu

Dijital TL yürütücüsü birine "1 TL'yi nasıl birebir tutuyorsunuz?" diye sorduğunda test
ettiği şey peg mekanizması değil, **hangi para katmanında olduğunuzu bilip bilmediğiniz.**

| Katman | 1:1'i ne sağlar |
| :--- | :--- |
| **Merkez bankası parası (CBDC)** | Peg **yoktur** — o paranın kendisi TL'dir, merkez bankası yükümlülüğüdür |
| **Banka mevduatı** | Mevzuat + mevduat sigortası + merkez bankası arkalığı |
| **Elektronik para (EPK)** | **Tam rezerv** — korunan hesapta birebir TL |
| **Stablecoin** | İhraççının rezerv iddiası, arkalık yok |
| **Algoritmik** | Hiçbir şey; tarih boyunca çöktü |

Çoğu takım "biz birebir destekliyoruz" der ve bunun bir **lisans** işi olduğunu
bilmediğini ele verir. Kazandıran cevap, kendini bu tabloda doğru yere koyduğunu
göstermektir.

**Anahtar terim: "paranın tekliği"** — tüm para biçimlerinin par değerde değişebilmesi
ilkesi. Merkez bankacılığının temel kavramlarından; doğru yerde kullanılırsa aynı dili
konuştuğunuzu anlatır.

---

## 4. Ona verilecek cevap (TASLAK — kullanıcı onaylamadı)

> **"Birebir tutmuyoruz — çünkü birebir tutmak e-para ihraç etmektir ve bu bir lisans
> meselesidir, bir yazılım meselesi değil. Biz para ihraç etmiyoruz; karşılığı zaten
> kesin olan parayı taşıyacak rayları kuruyoruz.**
>
> **dTL bizim paramız değil, bir yer tutucu. Testnet'te ihraç yetkisi tek elde, arz
> sadece mint/burn ile değişiyor, token serbestçe devredilemiyor — yani savunmamız
> gereken bir piyasa fiyatı hiç oluşmuyor. Gerçek dağıtımda bunun iki yolu var: ya tam
> rezerv ve itfa garantisiyle lisanslı e-para, ya da — bizim tercihimiz — bu katmana
> doğrudan Dijital Türk Lirası konması.**
>
> **Dijital TL konduğunda sizin sorunuz kendiliğinden ortadan kalkıyor: merkez bankası
> parası TL'ye endeksli değildir, TL'nin kendisidir. Peg sorusu çözülmez, buharlaşır."**

Son cümle kilit: *soruyu anladım, cevabı biliyorum, ve cevabın senin projen olduğunu da
biliyorum.*

---

## 5. Gerçek TL'ye geçiş: teknik değil, hukuki mesele

**Teknik katman: evet, neredeyse hiç değişmeden taşınır.** Fee-bump sponsorluğu, atomik
üçlü dağılım, esnaf-gönderemez guard'ı, idempotency, GİB belge üretimi — hepsi token'ın
karşılığı olup olmamasından bağımsız çalışır.

Mainnet'te kodda değişmesi gerekenler:

- `POST /faucet/mint` **tamamen kaldırılır** (zaten `GERCEK_VS_SIMULASYON.md` §3.2'de yazılı)
- Friendbot fonlaması → sponsorlu hesap oluşturma
- Admin anahtarı tek anahtardan **multisig/HSM'e** taşınır (şu an tek anahtar — mainnet'te kabul edilemez)
- `mint()` yalnızca **doğrulanmış tahsilat kanıtıyla** tetiklenir (PSP webhook → imza → mint)
- Storage TTL/rent gerçek maliyet olur; XLM gerçek para olur

**Asıl engel:** TL'ye endeksli, itfa taahhütlü, ödeme için kullanılan dijital birim
mevzuatta **elektronik paradır**; TCMB'den **Elektronik Para Kuruluşu lisansı** gerekir.
Lisans olmadan mainnet'e çıkmak bir yazılım adımı değil, hukuka aykırı bir adımdır.

> ⚠ **Mevzuat referansları sunumdan önce mutlaka doğrulanmalı.** Konuşmada 6493 sayılı
> Kanun (Ödeme ve Elektronik Para Kuruluşları) ve kripto varlık tarafında 7518 sayılı
> düzenleme (SPK) anıldı. Karşıdaki kişi bu alanın içinden — **yanlış veya eski bir kanun
> atfı her şeyden kötüdür.** Emin olunmayan durumda numara vermek yerine "e-para mevzuatı
> kapsamında lisans gerekir" demek daha güvenlidir.

---

## 6. Asıl fırsat: iddiayı "para"dan "ray"a taşımak

Bir CBDC projesinin en çok ihtiyaç duyduğu şey **kullanım senaryosu ve dağıtım
katmanıdır.** Merkez bankası parayı basar; onu esnafın cebine kimin, hangi deneyimle
ulaştıracağı açık bir sorudur. Bu proje tam olarak orayı inşa etmiş.

İnşa edilen dört şey, CBDC tasarımının bilinen dört başlığına birebir oturuyor:

1. **Kullanıcının ayrı bir ağ varlığı tutması gerekmiyor** — fee-bump sponsorluğu
   (CAP-0015). CBDC tasarımında gerçek bir tartışma konusu; burada çalışan kodla çözülmüş.
2. **Programlanabilir mutabakat** — `pay_merchant` tek çağrıda %99,6 / %0,1 / %0,3
   dağıtıyor, atomik. Dağılım politikası koddan değil **zincirdeki olaylardan** okunuyor.
3. **Ödeme anında vergi belgesi** — ödemeyle belgenin aynı akışta doğması; kayıt dışılık
   tarafında CBDC'den beklenen faydanın somut örneği.
4. **Yapısal kısıt: esnaf gönderemez** — programlanabilir paranın "ne yapılamayacağını"
   zincirde tanımlama örneği, negatif kanıtla doğrulanmış.

**Verilecek mesaj:** "Biz Dijital TL'ye rakip değiliz; Dijital TL'nin üzerinde koşacak
bir üye işyeri ödeme katmanının çalışan prototipiyiz. Token katmanını değiştirin,
üstteki her şey aynen çalışır."

**Zayıflığı teslim et — çünkü onun çözdüğü bir zayıflık:**
> "Bugünkü en kırılgan ekonomik noktamız ağ ücretini dalgalı XLM ile ödememiz.
> Dijital TL üzerinde bu sorun tamamen ortadan kalkar."

Kendi zayıf noktasını bilen ve karşısındakinin onu çözdüğünü söyleyen takım, o odadaki
en olgun takımdır.

---

## 7. Tuzaklar — bunlar sunumu bitirir

### 7.1. İsim meselesi — SİZ açın

Token'ın adı zincirde `"Dijital Türk Lirası Test"`, sembolü `dTL`. **Onun projesinin
adı.** Fark ederse (edecektir) ve açıklanmamışsa, "kendi paramızı bastık" iddiası gibi
okunur. Önden kapatın:

> "Token'a bilinçli olarak sizin projenize atıfla 'Dijital Türk Lirası Test' adını
> verdik — kendi paramız olduğu iddiasıyla değil, hedeflediğimiz katmanın adı olduğu
> için. Bu bir yer tutucu."

### 7.2. YENİDEN DEPLOY ETMEYİN

Ad `initialize` ile bir kez yazılıyor ve `AlreadyInitialized` ile kilitleniyor
(`token.rs:131`). Değiştirmek **yeni bir contract ID** demek — ve o anda Havuz 3 /
Havuz 4'te birikmiş **1:3 oranı kanıtı** (`GERCEK_VS_SIMULASYON.md` §1.3) ile
`TESTNET_DEPLOYMENT.md`'deki WASM hash'leri ve contract ID kayıtları orphan kalır.
**En güçlü zincir kanıtını bir isim için yakma.** Sözle çöz.

### 7.3. Yağcılık yapmayın

"Sizin projenizden ilham aldık" tarzı giriş teknik insanda ters teper. Puan aldıracak
şey iltifat değil, **onun problemini sizin de biliyor olmanız.**

### 7.4. Faucet'i saklamayın

"Şu an müşteri kendi kendine para basabiliyor, bu mainnet'te tamamen kaldırılması
gereken bir demo mekanizması" cümlesini **siz** kurun. O bunu zaten bilecek.
İtiraf edilmiş kusur güç, yakalanmış kusur ölümdür.

### 7.5. "Yarın mainnet'e çıkarız" demeyin

Lisans olmadan bu cümle, mevzuatı bilmediğinizi ilan eder.
Doğrusu: **"mainnet bir yazılım adımı değil, bir lisans adımı."**

---

## 8. 1 TL = 1 dTL somut olarak nasıl sağlanır (yol haritası içeriği)

Algoritmik peg, teminat fazlası, arbitraj botu — **hiçbiri gerekmiyor, hiçbiri doğru
cevap değil.** E-para modelinde peg üç parçayla, inşa yoluyla tutulur:

**a. Tam rezerv (korunan hesap).** Mint edilen her 1 dTL için yetkili bankadaki
bloke/emanet hesaba 1 TL yatırılmış olur. Değişmez kural: `total_supply ≤ rezerv bakiyesi`.
E-para mevzuatının zaten zorunlu tuttuğu yapı — icat edilmiyor, uyuluyor.

**b. İtfa garantisi — peg'i asıl tutan şey.** Hamil istediği an 1 dTL'yi 1 TL'ye
çevirebilmeli: `burn()` + banka transferi. Bir birimin 1 TL'den ucuza satılmasının tek
sebebi 1 TL'ye çevrilememe şüphesidir; itfa kesinse iskonto oluşamaz.
**`burn()` kontratta var; eksik olan off-chain itfa süreci ve onu tetikleyen uç.**

**c. Rezerv kanıtı (proof of reserve).** `total_supply()` zaten zincirden okunabiliyor.
Karşılığında rezerv hesabı bakiyesi bağımsız denetimle yayınlanır; eşitliği **herkes**
doğrulayabilir. Bu, projenin mevcut "1:3 oranını canlı bakiyeden ispatlıyoruz"
refleksinin doğal devamı.

Muhasebe diliyle: **dTL ihraççının bilançosunda bir yükümlülüktür, karşılığı rezervdeki
TL'dir. Peg piyasadan değil bilançodan gelir.**

---

## 9. Gözden kaçmaması gereken iki ekonomik risk

### 9.1. Kur riski gerçek ve mevcut

dTL TL'ye sabit varsayılıyor, ama ağ ücretini Havuz 2 **XLM** ile ödüyor ve XLM dalgalı.
%0,3'lük operasyonel kesinti TL cinsinden, gider XLM cinsinden.

Ölçülmüş rakamlarla (`ARCHITECTURE_DECISIONS.md` §8.2):
- Normal ödeme: ~36.596 stroop ≈ **0,00366 XLM**
- Yeni alıcıya **ilk** ödeme: ~**1 XLM** (dTL bakiye kaydı, 30 gün TTL)

Yani **her yeni esnaf ~1 XLM'lik bir edinme maliyeti** demek ve ancak belirli bir
hacimden sonra kendini amorti ediyor. "Birim ekonominiz ne?" sorusuna hazır olun.
Çözüm tarafı: hazinede XLM tamponu + TTL yenilemesini toplu yapma.

> ⚠ TL karşılığı günün XLM kuruna bağlıdır — sunumda sabit bir TL rakamı vermek yerine
> formülü verin.

### 9.2. Clawback yetkisi

`burn()` `from.require_auth()` istemiyor (`ARCHITECTURE_DECISIONS.md` §5.1 yan notu),
yani ihraççı teknik olarak herhangi bir adresin bakiyesini sahibinin onayı olmadan
yakabiliyor. E-para dünyasında bu **istenen** bir özelliktir (mahkeme kararı, hatalı
işlem düzeltmesi) — ama "gözetimsiz cüzdan" vurgusuyla gerilim yaratır.
**Jüri yakalarsa savunmada kalırsınız; siz söylerseniz düzenleyici olgunluk sinyali olur.**

---

## 10. Arkasından gelmesi neredeyse kesin sorular

| Soru | Cevap çekirdeği |
| :--- | :--- |
| "İtfa nasıl olacak?" | `burn()` + korunan hesaptan banka transferi; kontratta hazır, eksik olan off-chain süreç |
| "Rezervi kim denetler?" | `total_supply()` zincirden açık; rezerv bakiyesi bağımsız denetimle yayınlanır, eşitlik kamuya doğrulanabilir |
| "Neden Stellar, neden kendi ağınız değil?" | Fee-bump (CAP-0015) + düşük ücret; **ama asıl cevap:** "ağ seçimi tezimiz değil, tezimiz üstteki ödeme/dağıtım katmanı — o katman taşınabilir" |
| "Gizlilik?" | Dürüst ol: şu an tüm işlemler zincirde açık, bu bir CBDC için kabul edilemez, çözümü kapsam dışı. **Bilmek, çözmüş gibi yapmaktan iyidir.** |

---

## 11. Finalden önce ödev

Bu kişi karşınızdayken **TCMB Dijital Türk Lirası İşbirliği Platformu'nun kamuya açık
faz raporlarını okumamış olmak affedilmez.** Özellikle:

- programlanabilirlik
- dağıtım modeli
- katılımcı kuruluş yapısı

> ⚠ **Güncel faz/tarih durumunu kullanıcı kendisi doğrulasın.** Bu dosyada bilinçli
> olarak faz numarası veya tarih verilmedi — karşıdaki kişi o belgelerin yazarlarından
> biri ve yanlış bir atıf her şeyden kötüdür.

Mümkünse raporlardaki **terminolojiyi** kullanın; aynı kelimeleri kullanmak, aynı
problemi düşündüğünüzün en hızlı kanıtıdır.

---

## 12. Bu çerçevenin sunum senaryosuna etkisi

Sunum senaryosunun **kanıt bölümü değişmiyor** (fee-bump / 1:3 atomik dağılım /
esnaf-gönderemez negatif kanıtı).

**Kapanış bölümü tamamen değişiyor:** yol haritası slaytı artık "mainnet'e çıkacağız"
değil, **"bu katmanın altına Dijital TL konabilir"** demeli.

---

## 13. AÇIK KARARLAR — geri dönüldüğünde konuşulacak

- [ ] §4'teki cevap metni onaylanacak / kullanıcının kendi diliyle yeniden yazılacak
- [ ] İsim meselesi: §7.1'deki cümle mi, başka bir formülasyon mu?
- [ ] `GERCEK_VS_SIMULASYON.md` §4'teki mevcut jüri cevabı bu çerçeveyle güncellenecek mi?
- [ ] Aynı belgenin **§3.6'sı hatalı**: hâlâ "sistem yalnızca localhost'ta" diyor, oysa
      Render'da canlı. Jüri belgeyi okursa aleyhe çalışır — **düzeltilmeli.**
- [ ] Yol haritası slaytının içeriği (§8'deki üç parça + §12'deki kapanış)
- [ ] Mevzuat referansları doğrulanacak (§5 uyarısı)
- [ ] TCMB faz raporları okunacak (§11)
- [ ] Sunum senaryosunun açık üç sorusu hâlâ cevapsız: **süre, cihaz sayısı, internet garantisi**

---

## 14. Çapraz referanslar

- `GERCEK_VS_SIMULASYON.md` §1.3 — Havuz 3/4 bakiyelerinin 1:3 oranı (en güçlü zincir kanıtı)
- `GERCEK_VS_SIMULASYON.md` §3.1, §3.2 — dTL'nin mali değeri yok; faucet ve Friendbot'un mainnet karşılıksızlığı
- `GERCEK_VS_SIMULASYON.md` §4, §5 — hazır jüri cevabı ve yasak ifadeler tablosu
- `ARCHITECTURE_DECISIONS.md` §5.1 — burn sapması ve ihraççı clawback yan notu
- `ARCHITECTURE_DECISIONS.md` §5.2 — `DEMO_MODE` ve XLM enjeksiyonunun bilinçli manuelliği
- `ARCHITECTURE_DECISIONS.md` §7.5 — esnaf-gönderemez negatif kanıtı
- `ARCHITECTURE_DECISIONS.md` §8.2 — ücret tavanı bulgusu ve ilk-ödeme ~1 XLM maliyeti
- `contracts/dtl-token/src/token.rs` — `initialize` / `mint` / `burn` / `transfer`
