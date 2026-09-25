# ZK Katmanı — Oturum Notu ve Devam Noktası

> **Son güncelleme: 23 Eylül 2026.** · **Not (26 Eylül):** ZK dosyaları commit'lendi
> (`588765f`) ve push edildi; aşağıdaki "untracked / commit edilmedi" ifadeleri o günün durumudur.
> Bu dosya, sıfır bilgi ispatı (ZK) çalışmasının nerede kaldığını ve yeni bir
> oturumun nereden devam edeceğini anlatır. Bağlam için önce
> `docs/DTL_PEG_VE_JURI_STRATEJISI.md` okunmalıdır — ZK kararının *neden*
> alındığı orada.

---

## 0. Tek cümlelik durum

**Sosyal Fon hak ediş ispatı Stellar testnet'te çalışıyor ve doğrulandı.**
Kalan iki iş gösterim/anlatım tarafında: demo sayfası ve dokümana işleme.
Ödeme yoluna, mevcut kontratlara, client'a ve Render'a **hiç dokunulmadı**.

---

## 1. Neden bu katman var

KALEM'de her ödemenin %0,1'i Havuz 3'te (Sosyal Destek Fonu) birikiyor ama
**dağıtım mekanizması yoktu** — bu yüzden "burs dağıtıldı" iddiası hiç
kurulmadı. Dağıtım için kimin hak ettiğini bilmek gerekir; bunu bilmenin
klasik yolu gelir/hane/öğrenci belgesi toplamaktır, yani sistemin bugüne dek
bilinçli olarak kaçındığı her şey.

ZK bu ikilemi çözen bilinen tek yol: **doğrulama yapılır, veri toplanmaz.**

Bu seçim "zorlama" değil çünkü **ihtiyaç ZK'dan bağımsız olarak zaten
vardı ve projenin kendi belgesinde açıktı.**

---

## 2. Şu an ne çalışıyor — CANLI

**Kontrat:** `CAK3OCQQ5RAOWPIYYW25SYINSOUXSH6MNWWMGRAVPXWTZRTEQHCUJZZG`
**Deployer:** `GA4UBEKFDZSKEUSYPTMO4SJ6M32VNTRGKJTD5KDFO5JGJCH3INIFJ2TO`
(yalnızca bu iş için üretildi; `stellar keys` aliası: `zk-deployer`.
**Proje anahtarlarına dokunulmadı.**)

| Adım | İşlem hash |
| :--- | :--- |
| Deploy | `57dc66e753744e445edd428127cb27fe45e730a13d677d8df5c1fe8198156e73` |
| Başlatma (doğrulama anahtarı) | `59282f581391624fcf28f287c5b06aee2e685fa2b9628450487599a5467083b7` |
| Kök yayımlama | `ba9adc7ae5511a2e13468f433a18ffc26c0eeefc3786649d8b08d6f06c43ce07` |
| **Hak ediş talebi (kanıt doğrulandı)** | `491bd40c922dd9833b4cb62d5ac83a1c5fbf75d764a5876c968b1505d204be69` |

Çifte talep canlıda denendi → `Error(Contract, #404)` = `NullifierAlreadyUsed`.
`is_nullifier_used(...)` → `true`.

**Ölçülen maliyet:** doğrulama **46.059.131 CPU talimatı** = işlem başına
100.000.000 sınırının **%46'sı**.

---

## 3. Dosyalar

```
zk/                                    (untracked)
├── circuits/support_eligibility.circom  ana devre, DEPTH=20
├── circuits/poseidon2.circom            devre dışı hash yardımcısı
├── lib/poseidon.mjs                     BLS12-381 alanında Poseidon
├── lib/merkle.mjs                       hak sahipleri ağacı
├── scripts/demo.mjs                     uçtan uca senaryo (--recipient <hex>)
├── scripts/export-for-soroban.mjs       snarkjs → Soroban bayt düzeni
├── scripts/emit-rust-fixtures.mjs       → contracts/support-verifier/src/fixtures.rs
├── README.md                            mimari + dürüstlük notları + canlı kayıtlar
└── build/                               artefaktlar, .gitignore'da

contracts/support-verifier/            (untracked)
├── src/contract.rs                      submit_claim, publish_root, bağlayıcı
├── src/groth16.rs                       eşleşme kontrolü, G1 negatifleme
├── src/storage_types.rs                 VerifyingKey, Proof, nullifier anahtarları
├── src/errors.rs                        400-406 hata kodları
├── src/fixtures.rs                      ÜRETİLMİŞ — elle düzenlenmez
└── src/test.rs                          19 test

contracts/Cargo.toml                   (M) workspace'e 1 satır: "support-verifier"
contracts/Cargo.lock                   (M) cargo otomatik
```

**Hiçbir şey commit edilmedi.**

---

## 4. Testler

`cargo test --workspace` → **57/57**
- dtl-token 25, pool-manager 7, shared 6 → **el değmedi, aynen geçiyor**
- support-verifier **19**

Kritik olanlar:

| Test | Ne kanıtlıyor |
| :--- | :--- |
| `gercek_kanit_dogrulanir` | Gerçek snarkjs kanıtı zincir kodunda doğrulanıyor |
| `gecerli_talep_kabul_edilir_ve_nullifier_tuketilir` | Başarılı talep yolu uçtan uca |
| `ayni_donemde_ikinci_talep_reddedilir` | Çifte talep engeli |
| `baskasinin_baglayicisiyla_talep_reddedilir` | Öne geçme koruması |
| `yanlis_ama_gecerli_noktalarla_kanit_reddedilir` | Biçimsel kusursuz ama yanlış kanıt reddediliyor |
| `dogrulama_talimat_butcesine_sigar` | Bütçe bekçisi — devre büyürse kırmızı yanar |

---

## 5. Yeniden üretme (sıfırdan)

```bash
# Derleme (WSL şart — Windows'ta MSVC yok, link.exe GNU link'e çözülüyor)
wsl
cd "/mnt/c/Users/musta/OneDrive/Masaüstü/teknofest proje uygulama/kalem/zk"
~/bin/circom circuits/support_eligibility.circom -p bls12381 \
  --r1cs --wasm --sym -o build -l node_modules/circomlib/circuits

# Kurulum — KOMUTLARI ZİNCİRLEME, tek tek çalıştır (bkz. §6)
npx snarkjs powersoftau new bls12381 14 build/ptau/pot14_0000.ptau
npx snarkjs powersoftau contribute build/ptau/pot14_0000.ptau build/ptau/pot14_0001.ptau -e="..."
npx snarkjs powersoftau prepare phase2 build/ptau/pot14_0001.ptau build/ptau/pot14_final.ptau
npx snarkjs groth16 setup build/support_eligibility.r1cs build/ptau/pot14_final.ptau build/se_0000.zkey
npx snarkjs zkey contribute build/se_0000.zkey build/se_final.zkey -e="..."
npx snarkjs zkey export verificationkey build/se_final.zkey build/verification_key.json

# Kanıt + Rust sabitleri
node scripts/demo.mjs --recipient <64-hane-hex>
node scripts/export-for-soroban.mjs
node scripts/emit-rust-fixtures.mjs
```

Araçlar: `circom 2.2.3` WSL'de `~/bin/circom`; `snarkjs 0.7.6` + `circomlib 2.0.5`
Windows Node'unda `zk/node_modules` içinde. **WSL'de Node YOK** — snarkjs
Windows tarafında çalışır.

---

## 6. Tuzaklar — bir daha düşmemek için

1. **`npx snarkjs` komutlarını `&&` ile zincirleme.** Zincirlenmiş hâlde
   kurulum 48 dakika CPU harcayıp çıktı vermedi; tek tek çalıştırınca
   **45 saniye** sürdü. Sebep tam aydınlatılmadı, ama tekrarlanabilir.
2. **G2 kodlamasında `c1` ÖNCE gelir**: `X_c1 || X_c0 || Y_c1 || Y_c0`.
   snarkjs `[c0, c1]` verir. Sıra ters çevrilmezse kanıt **sessizce**
   geçersiz görünür — hata mesajı yok, sadece `false`.
3. **Bozuk nokta baytları `false` döndürmez, host TRAP eder**
   (`Error(Crypto, InvalidInput)`, "point not on curve"). İstemci bu iki
   durumu ayırmalı. Test: `bozuk_nokta_baytlari_trap_eder`.
4. **Windows'ta Rust derlemesi çalışmaz** (MSVC C++ build tools yok;
   `link.exe` Git Bash'in GNU `link`'ine çözülüyor). WSL kullan.
5. **`file://` URL'i elle birleştirme** — Windows yollarında `pathToFileURL`
   şart, yoksa üç eğik çizgi eksik kalır.
6. **`cargo test` `test_snapshots/` altına dosya yazar.** Tracked dosyalarda
   satır sonu gürültüsü, ayrıca yeni untracked dosyalar oluşur. İçerik farkı
   yoktur; `git checkout -- contracts/*/test_snapshots` ile temizlenir.
7. **Poseidon sabitleri BN254 için üretilmiş**, BLS12-381'de kullanılıyor.
   Alan boyutları yakın (254/255 bit) olduğundan tur sayıları uygun, ama
   kanonik değil. Üretimde yeniden üretilmeli. (`zk/README.md` §8)

---

## 7. Tasarım kararları — yeniden tartışılmasın

| Karar | Gerekçe |
| :--- | :--- |
| **BLS12-381**, BN254 değil | Soroban'ın yerleşik eşleşme fonksiyonları (CAP-0059) o eğri için. BN254 WASM'da yapılsa bütçeye sığmazdı. |
| **Merkle üyeliği**, EdDSA imza değil | circomlib'in EdDSA'sı Baby Jubjub üzerinde; Baby Jubjub BN254'e özgü, BLS12-381'de yok. Stellar'ın Privacy Pools prototipi de Merkle kullanıyor. |
| Devre dışı hash **derlenmiş devreyle** hesaplanıyor | circomlibjs BN254 alanında çalışır; iki taraf farklı sonuç üretir, Merkle kökü tutmaz ve hata bulunamazdı. |
| **Seçenek A: para hareketi YOK** | (a) Havuz 3'ün anahtarı yok + `transfer()` vatandaşı alıcı kabul etmiyor; tek yol ihraççının `burn`+`mint`'i ki bu zincirin değil ihraççının eylemi. (b) Havuz 3'ten para çıkarsa **1:3 kanıtı bozulur**. |
| **Ayrı kontrat**, mevcutlar değişmiyor | `dtl-token`/`pool-manager` redeploy edilmiyor; WASM hash'leri ve 1:3 kanıtı korunuyor. |
| Öne geçme koruması **baştan** eklendi | Stellar'ın prototipi bunu "not yet implemented" olarak belgeliyor. |

---

## 8. Testlerdeki kanıt ≠ testnet'teki kanıt

Bilinçli. `fixtures.rs` içindeki kanıt sabit test adresine
(`GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B`) bağlı; o hesabın
anahtarı elimizde yok, dolayısıyla testnet'te `require_auth()` geçmezdi.
Testnet talebi deployer adresine bağlı **ayrı bir kanıtla** yapıldı.

Bağlayıcı kuralı (`sha256(XDR(adres))`, üst 3 bit sıfırlanır) **yalnızca
kontratta** tanımlıdır; `demo.mjs` değeri `--recipient` ile dışarıdan alır.
İki yerde tanımlı bir kural er ya da geç ayrışır.

---

## 9. KALAN İŞLER

| # | İş | Süre | Not |
| :-- | :--- | :--- | :--- |
| 1 | **Gösterim sayfası** — tarayıcıda kanıt üretip kontrata gönderen ekran | ~2 sa | `/flow` gibi orchestrator'dan servis edilen düz HTML. **Expo'ya SOKMA** — `bignumber.js` beyaz ekran felaketinin (§8.1) tekrarı olur. |
| 2 | **`ARCHITECTURE_DECISIONS.md`'ye işleme + jüri anlatımı** | ~1 sa | Yeni bölüm; §8.2 kalan işler listesine de girmeli |
| 3 | (Opsiyonel) Yaş ispatı / rezerv ispatı | ~1,5 sa | Aynı motor, farklı koşul; marjinal maliyet düşük |

**1. iş sunum senaryosu netleşmeden yapılmamalı** — sayfanın akışın neresine
gireceği, kullanıcının finalist görüşmesinden çıkacak.

---

## 10. Jüriye anlatım

**Söylenecek:**
> *"Sosyal Fon'da para birikiyordu ama dağıtacak mekanizmamız yoktu — çünkü
> kimin hak ettiğini bilmek, insanlardan gelir ve aile bilgisi toplamak
> demekti. Bunu yapmak istemedik. Sıfır bilgi ispatıyla kişi hak ettiğini
> kanıtlıyor, biz hiçbir şey öğrenmiyoruz. Doğrulamayı da biz değil, Soroban
> kontratı BLS12-381 host fonksiyonlarıyla yapıyor — işlem bütçesinin %46'sı.
> Bir veritabanı bunu yapamaz, çünkü orada doğrulayan taraf güvenmeniz gereken
> taraftır."*

**Söylenmeyecek:**
- "Burs dağıttık" → doğrusu: **"dağıtım mekanizmasını kurduk, dağıtım yapmadık"**
- "Tamamen anonim" → doğrusu: "anonimlik kümesi hak sahibi sayısı kadar"
- "Üretime hazır" → doğrusu: "tören yapılmadı, ihraççı simüle"

---

## 11. Açık kararlar

- [ ] Gösterim sayfası sunumun neresine girecek?
- [ ] `zk/` ve `contracts/support-verifier/` commit'lensin mi, ne zaman?
- [ ] Yaş ispatı / rezerv ispatı eklensin mi (ikincil uygulamalar)?
- [ ] `docs/DTL_PEG_VE_JURI_STRATEJISI.md` §13'teki açık kararlar hâlâ bekliyor
- [ ] Sunum senaryosunun üç sorusu hâlâ cevapsız: **süre, cihaz sayısı, internet garantisi**
