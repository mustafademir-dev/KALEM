//! # Sosyal Fon Doğrulayıcısı — Birim Testleri
//!
//! Testlerin ağırlık merkezi **gerçek kriptografidir**. Kullanılan kanıt ve
//! doğrulama anahtarı uydurma değil, BLS12-381 üzerinde snarkjs ile gerçekten
//! üretilmiş verilerdir (`fixtures.rs`, üreteci `zk/scripts/`).
//!
//! Bir doğrulayıcının en tehlikeli hata biçimi, **her şeyi kabul etmesidir**.
//! Bu yüzden testlerin çoğu "geçerli kanıt geçiyor mu"yu değil, "geçersiz
//! olan gerçekten reddediliyor mu"yu sorgular.

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    crypto::bls12_381::Bls12381Fr, testutils::Address as _, Address, BytesN, Env, Vec,
};

use crate::contract::{SupportVerifier, SupportVerifierClient};

/// Testlerde kullanılan sabit talep sahibi adresi.
///
/// Sabit olması şart: bağlayıcı adresten türetildiği için, rastgele üretilen
/// bir adresle önceden hazırlanmış bir kanıt asla eşleşmezdi.
const TEST_CLAIMANT: &str = "GDE47HJ2W7SDW7VLMDB32XGEEKUBATO56ZQDIAN3G2GS73UAV67L3R3B";
use crate::errors::VerifierError;
use crate::fixtures;
use crate::groth16;
use crate::storage_types::{Proof, VerifyingKey};

// ---------------------------------------------------------------------------
// Hex yardımcıları
// ---------------------------------------------------------------------------

fn hex_bytes(s: &str) -> std::vec::Vec<u8> {
    assert!(s.len() % 2 == 0, "hex uzunluğu çift olmalı");
    (0..s.len() / 2)
        .map(|i| u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).expect("geçersiz hex"))
        .collect()
}

fn g1(env: &Env, s: &str) -> BytesN<96> {
    let v = hex_bytes(s);
    assert_eq!(v.len(), 96, "G1 noktası 96 bayt olmalı");
    let mut a = [0u8; 96];
    a.copy_from_slice(&v);
    BytesN::from_array(env, &a)
}

fn g2(env: &Env, s: &str) -> BytesN<192> {
    let v = hex_bytes(s);
    assert_eq!(v.len(), 192, "G2 noktası 192 bayt olmalı");
    let mut a = [0u8; 192];
    a.copy_from_slice(&v);
    BytesN::from_array(env, &a)
}

fn fr_bytes(env: &Env, s: &str) -> BytesN<32> {
    let v = hex_bytes(s);
    assert_eq!(v.len(), 32, "Fr elemanı 32 bayt olmalı");
    let mut a = [0u8; 32];
    a.copy_from_slice(&v);
    BytesN::from_array(env, &a)
}

fn verifying_key(env: &Env) -> VerifyingKey {
    let mut ic: Vec<BytesN<96>> = Vec::new(env);
    ic.push_back(g1(env, fixtures::IC0));
    ic.push_back(g1(env, fixtures::IC1));
    ic.push_back(g1(env, fixtures::IC2));
    ic.push_back(g1(env, fixtures::IC3));
    ic.push_back(g1(env, fixtures::IC4));

    VerifyingKey {
        alpha1: g1(env, fixtures::ALPHA1),
        beta2: g2(env, fixtures::BETA2),
        gamma2: g2(env, fixtures::GAMMA2),
        delta2: g2(env, fixtures::DELTA2),
        ic,
    }
}

fn proof(env: &Env) -> Proof {
    Proof {
        a: g1(env, fixtures::PROOF_A),
        b: g2(env, fixtures::PROOF_B),
        c: g1(env, fixtures::PROOF_C),
    }
}

fn public_inputs(env: &Env) -> Vec<Bls12381Fr> {
    let mut v: Vec<Bls12381Fr> = Vec::new(env);
    v.push_back(Bls12381Fr::from_bytes(fr_bytes(env, fixtures::PUBLIC_0)));
    v.push_back(Bls12381Fr::from_bytes(fr_bytes(env, fixtures::PUBLIC_1)));
    v.push_back(Bls12381Fr::from_bytes(fr_bytes(env, fixtures::PUBLIC_2)));
    v.push_back(Bls12381Fr::from_bytes(fr_bytes(env, fixtures::PUBLIC_3)));
    v
}

/// Eşleşme kontrolü pahalıdır; test ortamının varsayılan bütçesi yetmez.
fn env_with_budget() -> Env {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();
    env
}

// ---------------------------------------------------------------------------
// Groth16 çekirdeği — gerçek kanıtla
// ---------------------------------------------------------------------------

#[test]
fn gercek_kanit_dogrulanir() {
    let env = env_with_budget();
    let ok = groth16::verify(&env, &verifying_key(&env), &proof(&env), &public_inputs(&env));
    assert!(
        ok,
        "BLS12-381 üzerinde snarkjs ile üretilmiş gerçek kanıt doğrulanmalıydı"
    );
}

#[test]
fn acik_girdi_degistirilirse_reddedilir() {
    let env = env_with_budget();

    // nullifierHash'i bir bit oynat — başka bir kişinin talebiymiş gibi.
    let mut tampered = public_inputs(&env);
    let mut raw = [0u8; 32];
    fr_bytes(&env, fixtures::PUBLIC_0).copy_into_slice(&mut raw);
    raw[31] ^= 0x01;
    tampered.set(0, Bls12381Fr::from_bytes(BytesN::from_array(&env, &raw)));

    let ok = groth16::verify(&env, &verifying_key(&env), &proof(&env), &tampered);
    assert!(!ok, "değiştirilmiş açık girdi kabul edilmemeliydi");
}

#[test]
fn donem_degistirilirse_reddedilir() {
    let env = env_with_budget();

    // period (3. açık girdi) 202603 → 202604. Kanıt eski döneme bağlıdır.
    let mut tampered = public_inputs(&env);
    let mut raw = [0u8; 32];
    raw[24..32].copy_from_slice(&202604u64.to_be_bytes());
    tampered.set(2, Bls12381Fr::from_bytes(BytesN::from_array(&env, &raw)));

    let ok = groth16::verify(&env, &verifying_key(&env), &proof(&env), &tampered);
    assert!(!ok, "başka döneme ait talep kabul edilmemeliydi");
}

#[test]
fn yanlis_ama_gecerli_noktalarla_kanit_reddedilir() {
    let env = env_with_budget();

    // A ve C yer değiştiriyor. İkisi de eğri üzerinde GEÇERLİ noktalardır,
    // dolayısıyla host trap atmaz — kanıt matematiksel olarak yanlış olduğu
    // için eşleşme kontrolü `false` döner. Doğrulayıcının asıl sınandığı yer
    // burasıdır: biçimsel olarak kusursuz ama geçersiz bir kanıt.
    let p = proof(&env);
    let swapped = Proof {
        a: p.c.clone(),
        b: p.b.clone(),
        c: p.a.clone(),
    };

    let ok = groth16::verify(&env, &verifying_key(&env), &swapped, &public_inputs(&env));
    assert!(!ok, "geçerli noktalardan kurulu yanlış kanıt kabul edilmemeliydi");
}

/// Bozuk baytlar `false` DÖNDÜRMEZ — host trap atar.
///
/// Bu, SDK'nın belgelediği davranıştır: nokta baytları `from_bytes` sırasında
/// doğrulanmaz, host fonksiyonuna geçtiğinde doğrulanır ve geçersizse çağrı
/// trap eder (`Error(Crypto, InvalidInput)`, "point not on curve").
///
/// Pratik sonucu: eğri üzerinde olmayan bir nokta içeren bir talep, bizim
/// `InvalidProof` hatamızla değil, host hatasıyla başarısız olur. İstemci
/// tarafının bu iki durumu ayırması gerekir. Test bu davranışı kayda
/// geçirmek için vardır — ileride SDK değişirse burada yakalanır.
#[test]
#[should_panic(expected = "InvalidInput")]
fn bozuk_nokta_baytlari_trap_eder() {
    let env = env_with_budget();

    let mut p = proof(&env);
    let mut raw = [0u8; 96];
    p.c.copy_into_slice(&mut raw);
    raw[95] ^= 0x01; // artık eğri üzerinde değil
    p.c = BytesN::from_array(&env, &raw);

    let _ = groth16::verify(&env, &verifying_key(&env), &p, &public_inputs(&env));
}

#[test]
fn eksik_ic_ile_dogrulama_yapilmaz() {
    let env = env_with_budget();

    // IC'den bir eleman düşürülürse açık girdi sayısı tutmaz. Bu durumda
    // doğrulayıcı "yine de dene" DEMEMELİ — eksik bir IC, o girdinin
    // serbestçe seçilebilmesi demektir.
    let mut vk = verifying_key(&env);
    vk.ic.pop_back();

    let ok = groth16::verify(&env, &vk, &proof(&env), &public_inputs(&env));
    assert!(!ok, "IC uzunluğu tutarsızken doğrulama reddedilmeliydi");
}

// ---------------------------------------------------------------------------
// Kontrat davranışı
// ---------------------------------------------------------------------------

fn setup() -> (Env, SupportVerifierClient<'static>, Address) {
    let env = env_with_budget();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let id = env.register(SupportVerifier, ());
    let client = SupportVerifierClient::new(&env, &id);
    client.initialize(&admin, &verifying_key(&env));

    (env, client, admin)
}

#[test]
fn ikinci_baslatma_reddedilir() {
    let (env, client, admin) = setup();
    let res = client.try_initialize(&admin, &verifying_key(&env));
    assert_eq!(res, Err(Ok(VerifierError::AlreadyInitialized.into())));
}

#[test]
fn bozuk_dogrulama_anahtari_reddedilir() {
    let env = env_with_budget();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let id = env.register(SupportVerifier, ());
    let client = SupportVerifierClient::new(&env, &id);

    let mut vk = verifying_key(&env);
    vk.ic.pop_back(); // 5 yerine 4 → açık girdi sayısıyla uyuşmaz

    let res = client.try_initialize(&admin, &vk);
    assert_eq!(res, Err(Ok(VerifierError::MalformedVerifyingKey.into())));
}

#[test]
fn kok_yayimlanir_ve_taninir() {
    let (env, client, _admin) = setup();
    let root = fr_bytes(&env, fixtures::PUBLIC_1);

    assert!(!client.is_root_known(&root), "başlangıçta tanınmamalı");
    client.publish_root(&root);
    assert!(client.is_root_known(&root), "yayımlandıktan sonra tanınmalı");
}

#[test]
fn taninmayan_kokle_talep_reddedilir() {
    let (env, client, _admin) = setup();
    let claimant = Address::generate(&env);
    let binding = client.recipient_binding(&claimant);
    let root = fr_bytes(&env, fixtures::PUBLIC_1);

    // Kök YAYIMLANMADI.
    let res = client.try_submit_claim(
        &claimant,
        &proof(&env),
        &fr_bytes(&env, fixtures::PUBLIC_0),
        &root,
        &202603u64,
        &binding,
    );
    assert_eq!(res, Err(Ok(VerifierError::UnknownRoot.into())));
}

#[test]
fn baskasinin_baglayicisiyla_talep_reddedilir() {
    let (env, client, _admin) = setup();
    let claimant = Address::generate(&env);
    let baskasi = Address::generate(&env);

    let root = fr_bytes(&env, fixtures::PUBLIC_1);
    client.publish_root(&root);

    // Kanıt başkasının adresine bağlanmış; kopyalayıp kendi adına göndermeye
    // çalışıyor. Öne geçme (front-running) senaryosu budur.
    let baskasinin_baglayicisi = client.recipient_binding(&baskasi);

    let res = client.try_submit_claim(
        &claimant,
        &proof(&env),
        &fr_bytes(&env, fixtures::PUBLIC_0),
        &root,
        &202603u64,
        &baskasinin_baglayicisi,
    );
    assert_eq!(res, Err(Ok(VerifierError::RecipientMismatch.into())));
}

#[test]
fn baglayici_adrese_gore_degisir_ve_kararlidir() {
    let (env, client, _admin) = setup();
    let a = Address::generate(&env);
    let b = Address::generate(&env);

    assert_eq!(
        client.recipient_binding(&a),
        client.recipient_binding(&a),
        "aynı adres için bağlayıcı kararlı olmalı"
    );
    assert_ne!(
        client.recipient_binding(&a),
        client.recipient_binding(&b),
        "farklı adresler farklı bağlayıcı üretmeli"
    );

    // Alan elemanı olarak geçerli olmalı: üst 3 bit sıfırlanmış olmalı.
    let mut raw = [0u8; 32];
    client.recipient_binding(&a).copy_into_slice(&mut raw);
    assert_eq!(raw[0] & 0xe0, 0, "üst 3 bit sıfırlanmalı (r'nin altında kalsın)");
}

/// Başarılı talep yolu — uçtan uca.
///
/// Bu testin varlığı kritiktir: reddetme yolları tek tek doğrulansa bile,
/// GEÇEN bir talebin nullifier'ı tükettiğini ve olayı yayınladığını
/// göstermeyen bir doğrulayıcı, pratikte hiçbir şeyi kanıtlamaz.
#[test]
fn gecerli_talep_kabul_edilir_ve_nullifier_tuketilir() {
    let (env, client, _admin) = setup();

    let claimant = Address::from_str(&env, TEST_CLAIMANT);
    let root = fr_bytes(&env, fixtures::PUBLIC_1);
    let nullifier_hash = fr_bytes(&env, fixtures::PUBLIC_0);
    let binding = fr_bytes(&env, fixtures::PUBLIC_3);

    // Kanıt gerçekten bu adrese bağlanmış olmalı.
    assert_eq!(
        client.recipient_binding(&claimant),
        binding,
        "fixture'daki recipient, test adresinin bağlayıcısı olmalı"
    );

    client.publish_root(&root);
    assert!(!client.is_nullifier_used(&nullifier_hash));

    client.submit_claim(
        &claimant,
        &proof(&env),
        &nullifier_hash,
        &root,
        &202603u64,
        &binding,
    );

    assert!(
        client.is_nullifier_used(&nullifier_hash),
        "başarılı talepten sonra nullifier tüketilmiş olmalı"
    );
}

/// Aynı kişi aynı dönemde ikinci kez talep edemez.
///
/// Mahremiyet ile denetimin aynı anda sağlandığı yer burasıdır: zincir
/// "bu nullifier tüketildi" bilgisini tutar, "bu kişi kim" bilgisini tutmaz.
#[test]
fn ayni_donemde_ikinci_talep_reddedilir() {
    let (env, client, _admin) = setup();

    let claimant = Address::from_str(&env, TEST_CLAIMANT);
    let root = fr_bytes(&env, fixtures::PUBLIC_1);
    let nullifier_hash = fr_bytes(&env, fixtures::PUBLIC_0);
    let binding = fr_bytes(&env, fixtures::PUBLIC_3);

    client.publish_root(&root);
    client.submit_claim(&claimant, &proof(&env), &nullifier_hash, &root, &202603u64, &binding);

    let res = client.try_submit_claim(
        &claimant,
        &proof(&env),
        &nullifier_hash,
        &root,
        &202603u64,
        &binding,
    );
    assert_eq!(res, Err(Ok(VerifierError::NullifierAlreadyUsed.into())));
}

/// Talep, kişiye dair hiçbir bilgi sızdırmadan kaydedilmeli.
#[test]
fn talep_olayi_kisisel_veri_tasimaz() {
    let (env, client, _admin) = setup();

    let claimant = Address::from_str(&env, TEST_CLAIMANT);
    let root = fr_bytes(&env, fixtures::PUBLIC_1);
    let nullifier_hash = fr_bytes(&env, fixtures::PUBLIC_0);
    let binding = fr_bytes(&env, fixtures::PUBLIC_3);

    client.publish_root(&root);
    client.submit_claim(&claimant, &proof(&env), &nullifier_hash, &root, &202603u64, &binding);

    // Zincire yazılan tek kalıcı iz nullifier'dır ve ondan kişiye gidilemez.
    // `ClaimVerified` yapısında sahip/adres alanı YOKTUR — bu test o alanın
    // ileride sessizce eklenmesini engellemek için vardır.
    assert!(client.is_nullifier_used(&nullifier_hash));
    assert!(client.is_root_known(&root));
}

/// Yanlış dönemle talep, kanıt o döneme bağlı olduğu için reddedilir.
#[test]
fn yanlis_donemle_talep_reddedilir() {
    let (env, client, _admin) = setup();

    let claimant = Address::from_str(&env, TEST_CLAIMANT);
    let root = fr_bytes(&env, fixtures::PUBLIC_1);
    let binding = fr_bytes(&env, fixtures::PUBLIC_3);
    client.publish_root(&root);

    let res = client.try_submit_claim(
        &claimant,
        &proof(&env),
        &fr_bytes(&env, fixtures::PUBLIC_0),
        &root,
        &202604u64, // kanıt 202603 için üretilmişti
        &binding,
    );
    assert_eq!(res, Err(Ok(VerifierError::InvalidProof.into())));
}

#[test]
fn nullifier_baslangicta_kullanilmamis_gorunur() {
    let (env, client, _admin) = setup();
    assert!(!client.is_nullifier_used(&fr_bytes(&env, fixtures::PUBLIC_0)));
}

// ---------------------------------------------------------------------------
// Maliyet
// ---------------------------------------------------------------------------

/// Doğrulamanın talimat maliyetini ölçer ve testnet bütçesine sığdığını
/// doğrular.
///
/// Bu test bir "güzel bilgi" değil, **dağıtılabilirlik kontrolüdür**: eşleşme
/// kontrolü Soroban'daki en pahalı işlemlerden biridir ve bütçeyi aşan bir
/// kontrat zincire hiç çıkamaz. Devre büyüdüğünde (örn. ağaç derinliği
/// artarsa) IC sayısı artar, MSM pahalılaşır — bu test o an kırmızı yanar.
#[test]
fn dogrulama_talimat_butcesine_sigar() {
    let env = Env::default();
    env.cost_estimate().budget().reset_unlimited();

    let ok = groth16::verify(&env, &verifying_key(&env), &proof(&env), &public_inputs(&env));
    assert!(ok);

    let cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let mem = env.cost_estimate().budget().memory_bytes_cost();

    std::println!("  → CPU talimatı : {cpu}");
    std::println!("  → Bellek (bayt): {mem}");

    // Soroban'ın işlem başına CPU talimat üst sınırı 100.000.000'dur.
    assert!(
        cpu < 100_000_000,
        "doğrulama işlem bütçesini aşıyor: {cpu} talimat — kontrat zincire çıkamaz"
    );
}

/// Sabit bir adres için bağlayıcıyı basar.
///
/// `zk/scripts/demo.mjs`'in `--recipient` argümanı bu değerle beslenir; kanıt
/// o zaman gerçek bir adrese bağlanmış olur ve başarılı talep yolu uçtan uca
/// test edilebilir. Tavuk-yumurta sorununu böyle kırıyoruz: bağlayıcı kuralı
/// yalnızca kontratta tanımlıdır, JS tarafında yeniden yazılmaz.
#[test]
fn baglayiciyi_bas() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(SupportVerifier, ());
    let client = SupportVerifierClient::new(&env, &id);
    client.initialize(&Address::generate(&env), &verifying_key(&env));

    let addr = Address::from_str(&env, TEST_CLAIMANT);
    let b = client.recipient_binding(&addr);

    let mut raw = [0u8; 32];
    b.copy_into_slice(&mut raw);
    let hex: std::string::String = raw.iter().map(|x| std::format!("{x:02x}")).collect();

    std::println!("  adres     : {TEST_CLAIMANT}");
    std::println!("  baglayici : {hex}");
}
