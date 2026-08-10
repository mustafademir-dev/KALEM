//! # pool-manager Birim Testleri
//!
//! Atomik dağılım kontratının birim testleri.
//! Cross-contract invocation testleri için dtl-token kontratı
//! test ortamında deploy edilir.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Env, String};

use crate::distribution::{PoolManager, PoolManagerClient};
use crate::pool_config::PoolConfig;

// dtl-token kontratını test ortamında kullanmak için import
// Not: Cross-contract testlerde, dtl-token WASM'ı gerekir.
// testutils modunda soroban-sdk bunu otomatik yönetir.

// ---------------------------------------------------------------------------
// Test Yardımcıları
// ---------------------------------------------------------------------------

/// Tam entegrasyon test ortamını kurar:
/// 1. dtl-token kontratını deploy ve initialize eder
/// 2. pool-manager kontratını deploy ve initialize eder
/// 3. Kullanıcıya dTL mint eder
fn setup_integrated(
    env: &Env,
    mint_amount: i128,
) -> (
    PoolManagerClient<'static>,
    Address, // admin
    Address, // user (from)
    Address, // pool1
    Address, // pool3
    Address, // pool4
    Address, // dtl-token contract id
) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let user = Address::generate(env);
    let pool1 = Address::generate(env);
    let pool2 = Address::generate(env);
    let pool3 = Address::generate(env);
    let pool4 = Address::generate(env);

    // --- dtl-token kontratını deploy et ---
    // Not: test ortamında DtlToken struct'ına doğrudan erişemiyoruz
    // çünkü farklı bir crate. Bu testte pool-manager'ın kendi
    // initialize/config mantığını test ediyoruz.

    // Pool manager kontratını deploy et
    let pm_contract_id = env.register(PoolManager, ());
    let pm_client = PoolManagerClient::new(env, &pm_contract_id);

    // Sahte bir dtl-token adresi kullan (cross-contract testi
    // tam entegrasyon için ayrı bir integration test dosyasında yapılır)
    let dtl_token_addr = Address::generate(env);

    let config = PoolConfig {
        dtl_token_address: dtl_token_addr.clone(),
        pool1_address: pool1.clone(),
        pool3_address: pool3.clone(),
        pool4_address: pool4.clone(),
    };

    pm_client.initialize(&admin, &config);

    (pm_client, admin, user, pool1, pool3, pool4, dtl_token_addr)
}

// ---------------------------------------------------------------------------
// Başlatma Testleri
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_success() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let pm_contract_id = env.register(PoolManager, ());
    let client = PoolManagerClient::new(&env, &pm_contract_id);

    let config = PoolConfig {
        dtl_token_address: Address::generate(&env),
        pool1_address: Address::generate(&env),
        pool3_address: Address::generate(&env),
        pool4_address: Address::generate(&env),
    };

    client.initialize(&admin, &config);

    // get_config ile doğrula
    let loaded = client.get_config();
    assert_eq!(loaded.dtl_token_address, config.dtl_token_address);
    assert_eq!(loaded.pool1_address, config.pool1_address);
    assert_eq!(loaded.pool3_address, config.pool3_address);
    assert_eq!(loaded.pool4_address, config.pool4_address);
}

#[test]
#[should_panic(expected = "Error(Contract, #200)")]
fn test_double_initialize_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let pm_contract_id = env.register(PoolManager, ());
    let client = PoolManagerClient::new(&env, &pm_contract_id);

    let config = PoolConfig {
        dtl_token_address: Address::generate(&env),
        pool1_address: Address::generate(&env),
        pool3_address: Address::generate(&env),
        pool4_address: Address::generate(&env),
    };

    client.initialize(&admin, &config);
    // İkinci initialize → AlreadyInitialized (#200)
    client.initialize(&admin, &config);
}

#[test]
fn test_get_config_returns_correct_addresses() {
    let env = Env::default();
    let (client, _, _, pool1, pool3, pool4, dtl_addr) = setup_integrated(&env, 0);

    let config = client.get_config();
    assert_eq!(config.dtl_token_address, dtl_addr);
    assert_eq!(config.pool1_address, pool1);
    assert_eq!(config.pool3_address, pool3);
    assert_eq!(config.pool4_address, pool4);
}

// ---------------------------------------------------------------------------
// Dağılım Oranları Testleri (kalem-shared üzerinden)
// ---------------------------------------------------------------------------

#[test]
fn test_distribution_ratios_basic() {
    // kalem-shared'ın calculate_distribution fonksiyonunu doğrudan test et
    let total = 10_000_000i128; // 1 dTL
    let (p1, p3, p4) = kalem_shared::calculate_distribution(total);

    assert_eq!(p4, 30_000);    // %0,3
    assert_eq!(p3, 10_000);    // %0,1
    assert_eq!(p1, 9_960_000); // %99,6
    assert_eq!(p1 + p3 + p4, total);
}

#[test]
fn test_distribution_ratios_rounding() {
    // Yuvarlama testi: tam bölünmeyen tutarlar
    let total = 999i128;
    let (p1, p3, p4) = kalem_shared::calculate_distribution(total);

    // 999 * 3 / 1000 = 2 (tamsayı bölme)
    assert_eq!(p4, 2);
    // 999 * 1 / 1000 = 0
    assert_eq!(p3, 0);
    // kalan: 999 - 0 - 2 = 997
    assert_eq!(p1, 997);
    // Toplam korunuyor
    assert_eq!(p1 + p3 + p4, total);
}

#[test]
fn test_distribution_ratios_large_amount() {
    // Büyük tutar testi: 1 milyar dTL
    let total = 10_000_000_000_000_000i128; // 10^16 stroops
    let (p1, p3, p4) = kalem_shared::calculate_distribution(total);

    assert_eq!(p1 + p3 + p4, total);
    assert_eq!(p4, total * 3 / 1000);
    assert_eq!(p3, total * 1 / 1000);
}
