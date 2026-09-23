//! Storage tipleri ve sabitler.

use soroban_sdk::{contracttype, BytesN, Vec};

// ---------------------------------------------------------------------------
// TTL sabitleri
// ---------------------------------------------------------------------------

pub(crate) const DAY_IN_LEDGERS: u32 = 17_280;

pub(crate) const INSTANCE_BUMP_AMOUNT: u32 = 7 * DAY_IN_LEDGERS;
pub(crate) const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

/// Tüketilmiş nullifier kayıtları uzun yaşamalıdır.
///
/// Bir nullifier kaydı süresi dolup silinirse, aynı kişi aynı dönem için
/// İKİNCİ KEZ talep edebilir hale gelir — yani çifte talep engeli sessizce
/// çöker. Bu yüzden dönem uzunluğundan çok daha uzun bir süre seçildi.
/// Üretimde dönem kapandıktan sonra arşivlenmeleri (ya da kalıcı bir
/// birikimli yapıya taşınmaları) gerekir.
pub(crate) const NULLIFIER_BUMP_AMOUNT: u32 = 365 * DAY_IN_LEDGERS;
pub(crate) const NULLIFIER_LIFETIME_THRESHOLD: u32 = NULLIFIER_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ---------------------------------------------------------------------------
// Groth16 veri tipleri
// ---------------------------------------------------------------------------

/// Groth16 doğrulama anahtarı.
///
/// Bayt düzeni Soroban host'unun beklediği **sıkıştırılmamış** kodlamadır:
/// - G1 (96 bayt): `be(X) || be(Y)`
/// - G2 (192 bayt): `be(X_c1) || be(X_c0) || be(Y_c1) || be(Y_c0)`
///
/// ⚠ G2'de `c1` **önce** gelir. snarkjs JSON çıktısı `[c0, c1]` sırasıyla
/// verir; dönüştürücü bu sırayı ters çevirmek zorundadır. Sıra yanlış olursa
/// kanıt sessizce geçersiz görünür — hata mesajı vermez, sadece `false` döner.
#[contracttype]
#[derive(Clone)]
pub struct VerifyingKey {
    pub alpha1: BytesN<96>,
    pub beta2: BytesN<192>,
    pub gamma2: BytesN<192>,
    pub delta2: BytesN<192>,
    /// Uzunluğu açık girdi sayısı + 1 olmalıdır.
    pub ic: Vec<BytesN<96>>,
}

/// Groth16 kanıtı: (A ∈ G1, B ∈ G2, C ∈ G1).
#[contracttype]
#[derive(Clone)]
pub struct Proof {
    pub a: BytesN<96>,
    pub b: BytesN<192>,
    pub c: BytesN<96>,
}

// ---------------------------------------------------------------------------
// Storage anahtarları
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum VerifierKey {
    /// Yapılandırmayı yöneten adres.
    Admin,

    /// Başlatılma bayrağı.
    Initialized,

    /// Groth16 doğrulama anahtarı.
    Vk,

    /// Kurumun yayımladığı bir hak sahipleri kökü. Değer: kökün
    /// yayımlandığı ledger. Varlığı "bu kök tanınıyor" demektir.
    Root(BytesN<32>),

    /// Tüketilmiş bir nullifier. Anahtarın varlığı "bu dönem için talep
    /// edildi" demektir.
    Nullifier(BytesN<32>),
}

/// `submit_claim` başarılı olduğunda yayınlanan özet.
///
/// Dikkat: burada kişiye dair HİÇBİR alan yoktur. Yalnızca hangi kökün
/// altında, hangi dönemde bir talebin doğrulandığı kaydedilir.
#[contracttype]
#[derive(Clone)]
pub struct ClaimVerified {
    pub root: BytesN<32>,
    pub period: u64,
    pub ledger: u32,
}
