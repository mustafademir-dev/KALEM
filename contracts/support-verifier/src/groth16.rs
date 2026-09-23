//! Groth16 doğrulaması — BLS12-381 üzerinde.
//!
//! Doğrulama denklemi:
//!
//! ```text
//!   e(A, B) = e(α, β) · e(vk_x, γ) · e(C, δ)
//! ```
//!
//! Tek bir çoklu-eşleşme kontrolüne çevrilmiş hâli (host bunu destekler):
//!
//! ```text
//!   e(−A, B) · e(α, β) · e(vk_x, γ) · e(C, δ) = 1
//! ```
//!
//! burada `vk_x = IC₀ + Σ ICᵢ₊₁ · pubᵢ`.
//!
//! Bu dosyadaki tüm ağır iş Soroban'ın yerleşik (host) BLS12-381
//! fonksiyonlarına devredilir (CAP-0059). Eşleşme kontrolü tek bir host
//! çağrısıdır; aynı işlem WASM içinde saf Rust ile yapılsaydı talimat
//! bütçesine sığmazdı. Zincir üstü doğrulamayı mümkün kılan şey budur.

use soroban_sdk::{
    crypto::bls12_381::{Bls12381Fr, Bls12381G1Affine, Bls12381G2Affine},
    BytesN, Env, Vec,
};

use crate::storage_types::{Proof, VerifyingKey};

/// BLS12-381 taban alanı modülü `p`, big-endian 48 bayt.
///
/// G1 noktasını negatiflemek için gerekir: −(x, y) = (x, p − y).
const FIELD_MODULUS: [u8; 48] = [
    0x1a, 0x01, 0x11, 0xea, 0x39, 0x7f, 0xe6, 0x9a, 0x4b, 0x1b, 0xa7, 0xb6, 0x43, 0x4b, 0xac, 0xd7,
    0x64, 0x77, 0x4b, 0x84, 0xf3, 0x85, 0x12, 0xbf, 0x67, 0x30, 0xd2, 0xa0, 0xf6, 0xb0, 0xf6, 0x24,
    0x1e, 0xab, 0xff, 0xfe, 0xb1, 0x53, 0xff, 0xff, 0xb9, 0xfe, 0xff, 0xff, 0xff, 0xff, 0xaa, 0xab,
];

/// 48 baytlık big-endian çıkarma: `p − y`.
///
/// Sabit uzunlukludur ve dallanması girdiye bağlı değildir. Sonuç her zaman
/// `p`'den küçüktür çünkü çağıran taraf `y < p` garantisiyle çağırır (bayt
/// dizisi zincire geçerli bir eğri noktası olarak girmiştir).
fn sub_from_modulus(y: &[u8; 48]) -> [u8; 48] {
    let mut out = [0u8; 48];
    let mut borrow: i16 = 0;

    // En anlamsız bayttan başla.
    let mut i = 48;
    while i > 0 {
        i -= 1;
        let a = FIELD_MODULUS[i] as i16;
        let b = y[i] as i16 + borrow;
        let mut d = a - b;
        if d < 0 {
            d += 256;
            borrow = 1;
        } else {
            borrow = 0;
        }
        out[i] = d as u8;
    }

    out
}

/// Bir G1 noktasını negatifler: (x, y) → (x, p − y).
///
/// `y == 0` durumu BLS12-381 G1'inde oluşmaz (eğrinin 2-burulma noktası
/// yoktur), dolayısıyla `p − 0 = p` gibi geçersiz bir alan elemanı üretme
/// riski yoktur. Yine de savunmacı davranıp sıfır y'yi olduğu gibi bırakıyoruz.
fn negate_g1(env: &Env, point: &BytesN<96>) -> Bls12381G1Affine {
    let mut raw = [0u8; 96];
    point.copy_into_slice(&mut raw);

    let mut y = [0u8; 48];
    y.copy_from_slice(&raw[48..96]);

    let all_zero = y.iter().all(|b| *b == 0);
    if !all_zero {
        let neg = sub_from_modulus(&y);
        raw[48..96].copy_from_slice(&neg);
    }

    Bls12381G1Affine::from_bytes(BytesN::from_array(env, &raw))
}

/// Açık girdilerden `vk_x = IC₀ + Σ ICᵢ₊₁ · pubᵢ` hesaplar.
///
/// Toplam için `g1_msm` kullanılır (çoklu skaler çarpım) — tek tek `g1_mul`
/// + `g1_add` yapmaktan belirgin biçimde ucuzdur.
fn compute_vk_x(
    env: &Env,
    vk: &VerifyingKey,
    public_inputs: &Vec<Bls12381Fr>,
) -> Option<Bls12381G1Affine> {
    // IC uzunluğu açık girdi sayısı + 1 olmak ZORUNDA. Eşleşmezse doğrulama
    // anlamsızdır: eksik bir IC, saldırganın o girdiyi serbestçe seçmesine
    // izin verirdi.
    if vk.ic.len() != public_inputs.len() + 1 {
        return None;
    }

    let bls = env.crypto().bls12_381();

    let mut points: Vec<Bls12381G1Affine> = Vec::new(env);
    let mut scalars: Vec<Bls12381Fr> = Vec::new(env);

    for i in 0..public_inputs.len() {
        points.push_back(Bls12381G1Affine::from_bytes(vk.ic.get_unchecked(i + 1)));
        scalars.push_back(public_inputs.get_unchecked(i));
    }

    let acc = bls.g1_msm(points, scalars);
    let ic0 = Bls12381G1Affine::from_bytes(vk.ic.get_unchecked(0));

    Some(bls.g1_add(&ic0, &acc))
}

/// Groth16 kanıtını doğrular.
///
/// `true` → kanıt geçerli. `false` → geçersiz ya da girdi sayısı tutarsız.
pub fn verify(
    env: &Env,
    vk: &VerifyingKey,
    proof: &Proof,
    public_inputs: &Vec<Bls12381Fr>,
) -> bool {
    let vk_x = match compute_vk_x(env, vk, public_inputs) {
        Some(v) => v,
        None => return false,
    };

    let bls = env.crypto().bls12_381();

    let mut g1s: Vec<Bls12381G1Affine> = Vec::new(env);
    let mut g2s: Vec<Bls12381G2Affine> = Vec::new(env);

    // e(−A, B)
    g1s.push_back(negate_g1(env, &proof.a));
    g2s.push_back(Bls12381G2Affine::from_bytes(proof.b.clone()));

    // e(α, β)
    g1s.push_back(Bls12381G1Affine::from_bytes(vk.alpha1.clone()));
    g2s.push_back(Bls12381G2Affine::from_bytes(vk.beta2.clone()));

    // e(vk_x, γ)
    g1s.push_back(vk_x);
    g2s.push_back(Bls12381G2Affine::from_bytes(vk.gamma2.clone()));

    // e(C, δ)
    g1s.push_back(Bls12381G1Affine::from_bytes(proof.c.clone()));
    g2s.push_back(Bls12381G2Affine::from_bytes(vk.delta2.clone()));

    bls.pairing_check(g1s, g2s)
}
