//! # Havuz Konfigürasyonu
//!
//! pool-manager kontratının bilmesi gereken adresleri ve referansları
//! yönetir: dTL token kontrat adresi ve üç hedef havuzun (1, 3, 4) adresleri.
//!
//! Havuz 2 (Gaz Sponsor) bu kontratta YER ALMAZ — XLM tuttuğu ve
//! dTL dağılımına dahil olmadığı için pool-manager'ın kapsamı dışındadır.

use soroban_sdk::{contracttype, panic_with_error, Address, Env};

use crate::errors::PoolManagerError;
use crate::storage_types::PmDataKey;

// ---------------------------------------------------------------------------
// Konfigürasyon Yapısı
// ---------------------------------------------------------------------------

/// pool-manager'ın `initialize()` sırasında aldığı konfigürasyon.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolConfig {
    /// dTL token kontratının deploy edilmiş adresi.
    pub dtl_token_address: Address,

    /// Havuz 1 — Likidite Hazinesi (dTL alıcı).
    pub pool1_address: Address,

    /// Havuz 3 — Sosyal Destek Fonu (dTL alıcı).
    pub pool3_address: Address,

    /// Havuz 4 — Operasyonel Gelir (dTL alıcı).
    pub pool4_address: Address,
}

// ---------------------------------------------------------------------------
// Storage Fonksiyonları
// ---------------------------------------------------------------------------

/// Konfigürasyonu kontrat storage'ına kaydeder.
///
/// Her adresi ilgili `PmDataKey` altında instance storage'a yazar.
pub fn store_config(env: &Env, config: &PoolConfig) {
    env.storage()
        .instance()
        .set(&PmDataKey::DtlTokenAddress, &config.dtl_token_address);
    env.storage()
        .instance()
        .set(&PmDataKey::Pool1Address, &config.pool1_address);
    env.storage()
        .instance()
        .set(&PmDataKey::Pool3Address, &config.pool3_address);
    env.storage()
        .instance()
        .set(&PmDataKey::Pool4Address, &config.pool4_address);
}

/// Kayıtlı konfigürasyonu okur.
///
/// # Panics
/// Herhangi bir adres bulunamazsa `PoolManagerError::NotInitialized` hatası fırlatır.
pub fn load_config(env: &Env) -> PoolConfig {
    let dtl_token_address: Address = env
        .storage()
        .instance()
        .get(&PmDataKey::DtlTokenAddress)
        .unwrap_or_else(|| panic_with_error!(env, PoolManagerError::NotInitialized));

    let pool1_address: Address = env
        .storage()
        .instance()
        .get(&PmDataKey::Pool1Address)
        .unwrap_or_else(|| panic_with_error!(env, PoolManagerError::NotInitialized));

    let pool3_address: Address = env
        .storage()
        .instance()
        .get(&PmDataKey::Pool3Address)
        .unwrap_or_else(|| panic_with_error!(env, PoolManagerError::NotInitialized));

    let pool4_address: Address = env
        .storage()
        .instance()
        .get(&PmDataKey::Pool4Address)
        .unwrap_or_else(|| panic_with_error!(env, PoolManagerError::NotInitialized));

    PoolConfig {
        dtl_token_address,
        pool1_address,
        pool3_address,
        pool4_address,
    }
}
