//! # dTL Token — Storage Tipleri
//!
//! Soroban kontrat storage key'leri ve TTL (Time-To-Live) sabitleri.
//!
//! ## Storage Stratejisi
//! - **Instance Storage**: Admin, token metadata, havuz kayıtları, initialized flag,
//!   total supply — kontrat instance'ı ile birlikte yaşar.
//! - **Persistent Storage**: Adres bazlı bakiyeler — bağımsız TTL ile arşivlenebilir.

use soroban_sdk::{contracttype, Address};

// ---------------------------------------------------------------------------
// TTL Sabitleri
// ---------------------------------------------------------------------------

/// Bir ledger'daki ortalama süre ~5 saniye. Günlük yaklaşık 17.280 ledger.
pub(crate) const DAY_IN_LEDGERS: u32 = 17_280;

/// Instance storage TTL uzatma miktarı (7 gün).
pub(crate) const INSTANCE_BUMP_AMOUNT: u32 = 7 * DAY_IN_LEDGERS;

/// Instance storage TTL yenileme eşiği (6 gün — son 1 gün kala yenile).
pub(crate) const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

/// Bakiye (persistent) storage TTL uzatma miktarı (30 gün).
pub(crate) const BALANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;

/// Bakiye storage TTL yenileme eşiği (29 gün — son 1 gün kala yenile).
pub(crate) const BALANCE_LIFETIME_THRESHOLD: u32 = BALANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ---------------------------------------------------------------------------
// Storage Key Tanımları
// ---------------------------------------------------------------------------

/// dTL token kontratının storage key'leri.
///
/// Instance storage key'leri kontrat ömrü boyunca yaşar.
/// Persistent storage key'leri (Balance) bağımsız TTL ile yönetilir.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// İhraççı (admin) adresi.
    /// Storage: Instance
    Admin,

    /// Kontratın başlatılıp başlatılmadığını gösteren flag.
    /// Storage: Instance
    Initialized,

    /// Token adı (ör. "Dijital Türk Lirası Test").
    /// Storage: Instance
    TokenName,

    /// Token sembolü (ör. "dTL").
    /// Storage: Instance
    TokenSymbol,

    /// Ondalık basamak sayısı (ör. 7, Stellar standardı).
    /// Storage: Instance
    TokenDecimal,

    /// Toplam dTL arzı (stroops cinsinden).
    /// Storage: Instance
    TotalSupply,

    /// Havuz kaydı. Index: 0=Havuz 1 (Likidite), 1=Havuz 2 (Gaz),
    /// 2=Havuz 3 (Sosyal), 3=Havuz 4 (Operasyonel).
    /// Storage: Instance
    Pool(u32),

    /// Adres bazlı dTL bakiyesi (stroops cinsinden).
    /// Storage: Persistent (bağımsız TTL)
    Balance(Address),
}
