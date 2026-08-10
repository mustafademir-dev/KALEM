//! # Havuz Adresleri Kaydı (Pool Registry)
//!
//! dTL token kontratının `transfer()` fonksiyonu, alıcı adresin bu
//! registry'de kayıtlı olup olmadığını kontrol eder. Kayıtlı değilse
//! transfer reddedilir (P2P blokaj).
//!
//! ## PoolAddressType Ayrımı
//!
//! - **`SorobanAddress`**: Havuz 1 (Likidite), Havuz 3 (Sosyal), Havuz 4 (Operasyonel)
//!   → Soroban adresleridir. dTL bakiyeleri bu kontratın storage'ında
//!     mantıksal olarak tutulur.
//!
//! - **`StellarAccount`**: Havuz 2 (Gaz Sponsor)
//!   → Klasik Stellar hesabıdır (Ed25519 keypair, G... adresi).
//!     Fee-Bump transaction'ın `fee_source` alanı yalnızca klasik bir
//!     Stellar hesabı olabilir; Soroban kontrat adresi OLAMAZ.
//!     Bu havuz dTL değil XLM tutar, ancak pool_registry'de kayıtlıdır
//!     çünkü `transfer()` override'ı tüm havuz adreslerini tanımalıdır.

use soroban_sdk::{contracttype, panic_with_error, Address, Env, Vec};

use crate::errors::TokenError;
use crate::storage_types::DataKey;

// ---------------------------------------------------------------------------
// Havuz Adres Tipi
// ---------------------------------------------------------------------------

/// Havuz adresinin Soroban kontrat adresi mi yoksa klasik Stellar
/// hesabı mı olduğunu belirler.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PoolAddressType {
    /// Havuz 1, 3, 4 — Soroban adresi. dTL bakiyesi kontrat storage'ında tutulur.
    SorobanAddress,

    /// Havuz 2 — Klasik Stellar hesabı (Ed25519, G... adresi).
    /// Fee-Bump fee_source olabilmesi için ZORUNLU.
    /// Bu havuz dTL değil XLM tutar.
    StellarAccount,
}

// ---------------------------------------------------------------------------
// Havuz Kimliği
// ---------------------------------------------------------------------------

/// Sistemdeki dört havuzun kimlik tanımlayıcısı.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PoolId {
    /// Havuz 1 — Likidite / Üye İşyeri Hazinesi (dTL)
    Liquidity,

    /// Havuz 2 — Gaz Sponsor Havuzu (XLM, klasik Stellar hesabı)
    GasSponsor,

    /// Havuz 3 — Sosyal Destek Fonu (dTL)
    SocialFund,

    /// Havuz 4 — Operasyonel Gelir Havuzu (dTL)
    Operational,
}

// ---------------------------------------------------------------------------
// Havuz Kaydı
// ---------------------------------------------------------------------------

/// Tek bir havuzun kayıt yapısı.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolEntry {
    /// Havuz kimliği.
    pub pool_id: PoolId,

    /// Havuzun on-chain adresi.
    pub address: Address,

    /// Adres tipi: Soroban kontrat adresi mi, klasik Stellar hesabı mı?
    pub address_type: PoolAddressType,
}

/// Havuz kimliğini storage index'ine çevirir (0-3).
fn pool_id_to_index(pool_id: &PoolId) -> u32 {
    match pool_id {
        PoolId::Liquidity => 0,   // Havuz 1
        PoolId::GasSponsor => 1,  // Havuz 2
        PoolId::SocialFund => 2,  // Havuz 3
        PoolId::Operational => 3, // Havuz 4
    }
}

/// Havuz adres tipini doğrular.
///
/// - Havuz 2 (GasSponsor) → `StellarAccount` olmalı
/// - Havuz 1, 3, 4 → `SorobanAddress` olmalı
fn validate_pool_type(env: &Env, entry: &PoolEntry) {
    let expected = match entry.pool_id {
        PoolId::GasSponsor => PoolAddressType::StellarAccount,
        _ => PoolAddressType::SorobanAddress,
    };
    if entry.address_type != expected {
        panic_with_error!(env, TokenError::InvalidPoolType);
    }
}

// ---------------------------------------------------------------------------
// Storage Fonksiyonları
// ---------------------------------------------------------------------------

/// Toplam kayıtlı havuz sayısı.
const POOL_COUNT: u32 = 4;

/// Havuz adreslerini kontrat storage'ına kaydeder.
///
/// `initialize()` sırasında bir kez çağrılır. Dört havuzun adresi ve
/// tipleri kaydedilir.
///
/// # Parametreler
/// - `pools`: Dört `PoolEntry`'den oluşan dizi.
///
/// # Doğrulamalar
/// - Havuz 2'nin `address_type == StellarAccount` olduğu doğrulanır.
/// - Havuz 1/3/4'ün `address_type == SorobanAddress` olduğu doğrulanır.
///
/// # Panics
/// Havuz adres tipi beklenen değerle eşleşmezse `TokenError::InvalidPoolType`.
pub fn register_pools(env: &Env, pools: &Vec<PoolEntry>) {
    // Tam olarak 4 havuz kaydedilmeli
    if pools.len() != POOL_COUNT {
        panic!("exactly 4 pool entries required");
    }

    for i in 0..pools.len() {
        let entry = pools.get(i).unwrap();
        // Adres tipi doğrulaması
        validate_pool_type(env, &entry);

        // Storage'a yaz: DataKey::Pool(index) → PoolEntry
        let index = pool_id_to_index(&entry.pool_id);
        env.storage().instance().set(&DataKey::Pool(index), &entry);
    }
}

/// Verilen adresin kayıtlı havuzlardan biri olup olmadığını kontrol eder.
///
/// `transfer()` override'ında çağrılır. Adres dört havuzdan birine
/// eşleşmezse `false` döner → transfer reddedilir.
///
/// # Dönüş
/// - `true`: Adres kayıtlı bir havuz adresidir, transfer izni verilir.
/// - `false`: Adres havuz değildir, P2P transfer reddedilir.
pub fn is_authorized_recipient(env: &Env, to: &Address) -> bool {
    for i in 0..POOL_COUNT {
        if let Some(entry) = env
            .storage()
            .instance()
            .get::<DataKey, PoolEntry>(&DataKey::Pool(i))
        {
            if entry.address == *to {
                return true;
            }
        }
    }
    false
}

/// Belirtilen havuz kimliğine ait `PoolEntry`'yi döner.
///
/// # Dönüş
/// Havuz kayıtlıysa `Some(PoolEntry)`, değilse `None`.
pub fn get_pool(env: &Env, pool_id: PoolId) -> Option<PoolEntry> {
    let index = pool_id_to_index(&pool_id);
    env.storage()
        .instance()
        .get::<DataKey, PoolEntry>(&DataKey::Pool(index))
}
