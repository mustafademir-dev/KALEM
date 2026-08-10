//! # kalem-shared
//!
//! KALEM kontratları arasında paylaşılan ortak tipler, sabitler ve hata tanımları.
//!
//! ## Modül Yapısı
//! - Dağılım oranları (Havuz 1/3/4 binde cinsinden sabitler)
//! - Havuz adres tipi ayrımı (Soroban kontrat adresi vs. klasik Stellar hesabı)
//! - Ortak hata kodları
//! - Dağılım hesaplama yardımcı fonksiyonu

#![no_std]

use soroban_sdk::contracterror;

// ---------------------------------------------------------------------------
// Dağılım Oranları (binde cinsinden — toplam 1000)
// ---------------------------------------------------------------------------
// Ödeme tutarı dTL olarak üç havuza atomik dağılır:
//   Havuz 1 (Likidite):    %99,6  → 996 / 1000
//   Havuz 3 (Sosyal):      %0,1   →   1 / 1000
//   Havuz 4 (Operasyonel): %0,3   →   3 / 1000
//
// Havuz 2 (Gaz Sponsor) dTL dağılımına dahil DEĞİLDİR; XLM tutar.

/// Havuz 1'e aktarılacak pay — binde 996
pub const POOL1_RATIO_BPS: u32 = 996;

/// Havuz 3'e aktarılacak pay — binde 1
pub const POOL3_RATIO_BPS: u32 = 1;

/// Havuz 4'e aktarılacak pay — binde 3
pub const POOL4_RATIO_BPS: u32 = 3;

/// Toplam — binde 1000 (doğrulama sabiti)
pub const TOTAL_RATIO_BPS: u32 = 1000;

// Derleme zamanı doğrulama: oranlar toplamı 1000 olmalı.
const _: () = assert!(
    POOL1_RATIO_BPS + POOL3_RATIO_BPS + POOL4_RATIO_BPS == TOTAL_RATIO_BPS,
    "Dagitim oranlari toplami 1000 olmali"
);

// ---------------------------------------------------------------------------
// Dağılım Hesaplama
// ---------------------------------------------------------------------------

/// Toplam tutarı 3 havuza böler.
///
/// Havuz 4 ve Havuz 3 payları önce hesaplanır, Havuz 1 payı "kalan" olarak
/// belirlenir. Böylece tamsayı yuvarlama kayıpları yalnızca Havuz 1'e yansır
/// ve `pool1 + pool3 + pool4 == total_amount` eşitliği her zaman sağlanır.
///
/// # Parametreler
/// - `total_amount`: Dağıtılacak toplam dTL tutarı (stroops cinsinden).
///
/// # Dönüş
/// `(pool1_share, pool3_share, pool4_share)`
///
/// # Panics
/// `total_amount <= 0` ise `SharedError::InvalidAmount` hatası fırlatır.
pub fn calculate_distribution(total_amount: i128) -> (i128, i128, i128) {
    if total_amount <= 0 {
        panic!("invalid amount for distribution");
    }

    let pool4_share = total_amount * (POOL4_RATIO_BPS as i128) / (TOTAL_RATIO_BPS as i128);
    let pool3_share = total_amount * (POOL3_RATIO_BPS as i128) / (TOTAL_RATIO_BPS as i128);
    let pool1_share = total_amount - pool3_share - pool4_share;

    (pool1_share, pool3_share, pool4_share)
}

// ---------------------------------------------------------------------------
// Havuz Adres Tipi
// ---------------------------------------------------------------------------
// Havuz 1, 3, 4 → Soroban adresi (kontrat storage'ında mantıksal bakiye)
// Havuz 2       → Klasik Stellar hesabı (Ed25519 G... adresi)
//                  Fee-Bump transaction'ın fee source'u olabilmesi için ZORUNLU.
//
// Bu ayrım, pool_registry ve auth mantığında PoolAddressType enum'ı ile modellenir.
// (Enum tanımı, dtl-token kontratının pool_registry modülünde yer alır;
//  burada yalnızca konsept belgelenmiştir.)

// ---------------------------------------------------------------------------
// Ortak Hata Kodları
// ---------------------------------------------------------------------------

/// Kontratlar arası paylaşılan hata kodları.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SharedError {
    /// Dağılım oranları toplamı 1000'e eşit değil.
    InvalidRatioSum = 100,

    /// Geçersiz veya sıfır tutar.
    InvalidAmount = 101,

    /// Aritmetik taşma.
    Overflow = 102,
}

// ---------------------------------------------------------------------------
// Birim Testleri
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ratios_sum_to_1000() {
        assert_eq!(
            POOL1_RATIO_BPS + POOL3_RATIO_BPS + POOL4_RATIO_BPS,
            TOTAL_RATIO_BPS
        );
    }

    #[test]
    fn test_calculate_distribution_basic() {
        // 10_000_000 stroops (1 dTL) dağıtımı
        let (p1, p3, p4) = calculate_distribution(10_000_000);
        assert_eq!(p4, 10_000_000 * 3 / 1000);   // 30_000
        assert_eq!(p3, 10_000_000 * 1 / 1000);   // 10_000
        assert_eq!(p1, 10_000_000 - 10_000 - 30_000); // 9_960_000
        assert_eq!(p1 + p3 + p4, 10_000_000);
    }

    #[test]
    fn test_calculate_distribution_preserves_total() {
        // Yuvarlama testi: toplam her zaman korunmalı
        let amounts = [1, 7, 99, 1000, 999_999, 123_456_789];
        for &amount in &amounts {
            let (p1, p3, p4) = calculate_distribution(amount);
            assert_eq!(p1 + p3 + p4, amount, "toplam korunmadı: amount={}", amount);
        }
    }

    #[test]
    fn test_calculate_distribution_small_amount() {
        // 1 stroops — küçük tutarlarda yuvarlama davranışı
        let (p1, p3, p4) = calculate_distribution(1);
        assert_eq!(p4, 0); // 1 * 3 / 1000 = 0
        assert_eq!(p3, 0); // 1 * 1 / 1000 = 0
        assert_eq!(p1, 1); // kalan
        assert_eq!(p1 + p3 + p4, 1);
    }

    #[test]
    #[should_panic]
    fn test_calculate_distribution_zero_panics() {
        calculate_distribution(0);
    }

    #[test]
    #[should_panic]
    fn test_calculate_distribution_negative_panics() {
        calculate_distribution(-100);
    }
}
