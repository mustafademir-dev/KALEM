//! # pool-manager — Storage Tipleri
//!
//! Pool manager kontratının storage key'leri ve TTL sabitleri.

use soroban_sdk::contracttype;

// ---------------------------------------------------------------------------
// TTL Sabitleri
// ---------------------------------------------------------------------------

pub(crate) const DAY_IN_LEDGERS: u32 = 17_280;
pub(crate) const INSTANCE_BUMP_AMOUNT: u32 = 7 * DAY_IN_LEDGERS;
pub(crate) const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ---------------------------------------------------------------------------
// Storage Key Tanımları
// ---------------------------------------------------------------------------

/// pool-manager kontratının storage key'leri.
/// Tümü instance storage'da tutulur.
#[contracttype]
#[derive(Clone)]
pub enum PmDataKey {
    /// Kontratı yöneten admin adresi.
    Admin,

    /// Kontratın başlatılıp başlatılmadığını gösteren flag.
    Initialized,

    /// dTL token kontratının adresi (cross-contract invocation için).
    DtlTokenAddress,

    /// Havuz 1 (Likidite Hazinesi) adresi.
    Pool1Address,

    /// Havuz 3 (Sosyal Destek Fonu) adresi.
    Pool3Address,

    /// Havuz 4 (Operasyonel Gelir) adresi.
    Pool4Address,
}
