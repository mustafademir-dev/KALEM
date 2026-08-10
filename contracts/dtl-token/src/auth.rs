//! # İhraççı Yetki Denetimi (Auth)
//!
//! dTL varlığının mint ve burn işlemleri yalnızca yetkili ihraççı (admin)
//! tarafından gerçekleştirilebilir. Bu modül, çağrıcının ihraççı olup
//! olmadığını doğrular.

use soroban_sdk::{Address, Env};

use crate::errors::TokenError;
use crate::storage_types::DataKey;

// ---------------------------------------------------------------------------
// Admin Yönetimi
// ---------------------------------------------------------------------------

/// İhraççı (admin) adresini kontrat storage'ına kaydeder.
///
/// `initialize()` sırasında bir kez çağrılır.
///
/// # Panics
/// Zaten admin kaydedilmişse `TokenError::AlreadyInitialized` hatası fırlatır.
pub fn set_admin(env: &Env, admin: &Address) {
    if env.storage().instance().has(&DataKey::Admin) {
        panic_with_error!(env, TokenError::AlreadyInitialized);
    }
    env.storage().instance().set(&DataKey::Admin, admin);
}

/// Mevcut ihraççı (admin) adresini döner.
///
/// # Panics
/// Admin henüz kaydedilmemişse `TokenError::NotInitialized` hatası fırlatır.
pub fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, TokenError::NotInitialized))
}

/// Çağrıcının ihraççı (admin) olduğunu doğrular.
///
/// 1. Kayıtlı admin adresini alır.
/// 2. Çağrıcının admin olduğunu kontrol eder.
/// 3. Soroban auth framework üzerinden `require_auth()` çağırır.
///
/// # Panics
/// - Admin kaydedilmemişse `TokenError::NotInitialized`
/// - Çağrıcı admin değilse `TokenError::UnauthorizedIssuer`
pub fn require_admin(env: &Env, caller: &Address) {
    let admin = get_admin(env);
    if *caller != admin {
        panic_with_error!(env, TokenError::UnauthorizedIssuer);
    }
    caller.require_auth();
}

// `panic_with_error!` makrosu soroban_sdk tarafından sağlanır.
// `use soroban_sdk::panic_with_error;` re-export'a gerek yok,
// SDK'nın prelude'u bunu otomatik sağlar.
// Ancak #![no_std] ortamında açıkça import edilmesi gerekebilir:
use soroban_sdk::panic_with_error;
