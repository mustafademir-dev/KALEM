//! # dTL Token Birim Testleri
//!
//! `soroban-sdk` test framework'ü ile dTL token kontratının
//! tüm kritik akışlarını doğrular.

#![cfg(test)]

use soroban_sdk::{testutils::Address as _, vec, Address, Env, String};

use crate::pool_registry::{PoolAddressType, PoolEntry, PoolId};
use crate::token::{DtlToken, DtlTokenClient};

// ---------------------------------------------------------------------------
// Test Yardımcıları
// ---------------------------------------------------------------------------

/// Test ortamını ve kontratı başlatan yardımcı yapı.
struct TestSetup<'a> {
    env: Env,
    client: DtlTokenClient<'a>,
    admin: Address,
    pool1: Address,
    pool2: Address,
    pool3: Address,
    pool4: Address,
}

fn setup() -> TestSetup<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(DtlToken, ());
    let client = DtlTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let pool1 = Address::generate(&env);
    let pool2 = Address::generate(&env);
    let pool3 = Address::generate(&env);
    let pool4 = Address::generate(&env);

    let pools = vec![
        &env,
        PoolEntry {
            pool_id: PoolId::Liquidity,
            address: pool1.clone(),
            address_type: PoolAddressType::SorobanAddress,
        },
        PoolEntry {
            pool_id: PoolId::GasSponsor,
            address: pool2.clone(),
            address_type: PoolAddressType::StellarAccount,
        },
        PoolEntry {
            pool_id: PoolId::SocialFund,
            address: pool3.clone(),
            address_type: PoolAddressType::SorobanAddress,
        },
        PoolEntry {
            pool_id: PoolId::Operational,
            address: pool4.clone(),
            address_type: PoolAddressType::SorobanAddress,
        },
    ];

    client.initialize(
        &admin,
        &String::from_str(&env, "Dijital Türk Lirası Test"),
        &String::from_str(&env, "dTL"),
        &7u32,
        &pools,
    );

    TestSetup {
        env,
        client,
        admin,
        pool1,
        pool2,
        pool3,
        pool4,
    }
}

// ---------------------------------------------------------------------------
// Başlatma Testleri
// ---------------------------------------------------------------------------

#[test]
fn test_initialize_metadata() {
    let t = setup();
    assert_eq!(t.client.name(), String::from_str(&t.env, "Dijital Türk Lirası Test"));
    assert_eq!(t.client.symbol(), String::from_str(&t.env, "dTL"));
    assert_eq!(t.client.decimals(), 7u32);
    assert_eq!(t.client.total_supply(), 0i128);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_double_initialize_panics() {
    let t = setup();

    let pools = vec![
        &t.env,
        PoolEntry {
            pool_id: PoolId::Liquidity,
            address: t.pool1.clone(),
            address_type: PoolAddressType::SorobanAddress,
        },
        PoolEntry {
            pool_id: PoolId::GasSponsor,
            address: t.pool2.clone(),
            address_type: PoolAddressType::StellarAccount,
        },
        PoolEntry {
            pool_id: PoolId::SocialFund,
            address: t.pool3.clone(),
            address_type: PoolAddressType::SorobanAddress,
        },
        PoolEntry {
            pool_id: PoolId::Operational,
            address: t.pool4.clone(),
            address_type: PoolAddressType::SorobanAddress,
        },
    ];

    // İkinci initialize → AlreadyInitialized (#5)
    t.client.initialize(
        &t.admin,
        &String::from_str(&t.env, "Test"),
        &String::from_str(&t.env, "TST"),
        &7u32,
        &pools,
    );
}

// ---------------------------------------------------------------------------
// Mint Testleri
// ---------------------------------------------------------------------------

#[test]
fn test_mint_success() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &10_000_000);

    assert_eq!(t.client.balance(&user), 10_000_000);
    assert_eq!(t.client.total_supply(), 10_000_000);
}

#[test]
fn test_mint_multiple() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &5_000_000);
    t.client.mint(&user, &3_000_000);

    assert_eq!(t.client.balance(&user), 8_000_000);
    assert_eq!(t.client.total_supply(), 8_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_mint_zero_amount_panics() {
    let t = setup();
    let user = Address::generate(&t.env);
    t.client.mint(&user, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_mint_negative_amount_panics() {
    let t = setup();
    let user = Address::generate(&t.env);
    t.client.mint(&user, &-100);
}

// ---------------------------------------------------------------------------
// Burn Testleri
// ---------------------------------------------------------------------------

#[test]
fn test_burn_success() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &10_000_000);
    t.client.burn(&user, &3_000_000);

    assert_eq!(t.client.balance(&user), 7_000_000);
    assert_eq!(t.client.total_supply(), 7_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_burn_insufficient_balance_panics() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &1_000);
    t.client.burn(&user, &2_000); // Yetersiz bakiye → InsufficientBalance (#3)
}

// ---------------------------------------------------------------------------
// Transfer Testleri — P2P Blokaj
// ---------------------------------------------------------------------------

#[test]
fn test_transfer_to_pool1_success() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &10_000_000);
    t.client.transfer(&user, &t.pool1, &5_000_000);

    assert_eq!(t.client.balance(&user), 5_000_000);
    assert_eq!(t.client.balance(&t.pool1), 5_000_000);
}

#[test]
fn test_transfer_to_pool3_success() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &1_000_000);
    t.client.transfer(&user, &t.pool3, &500_000);

    assert_eq!(t.client.balance(&user), 500_000);
    assert_eq!(t.client.balance(&t.pool3), 500_000);
}

#[test]
fn test_transfer_to_pool4_success() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &1_000_000);
    t.client.transfer(&user, &t.pool4, &300_000);

    assert_eq!(t.client.balance(&user), 700_000);
    assert_eq!(t.client.balance(&t.pool4), 300_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_transfer_p2p_blocked() {
    let t = setup();
    let sender = Address::generate(&t.env);
    let receiver = Address::generate(&t.env); // Havuz DEĞİL — random adres

    t.client.mint(&sender, &10_000_000);

    // P2P transfer denemesi → UnauthorizedRecipient (#2)
    t.client.transfer(&sender, &receiver, &1_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_transfer_insufficient_balance_panics() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &1_000);
    // Havuza transfer ama yetersiz bakiye
    t.client.transfer(&user, &t.pool1, &2_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_transfer_zero_amount_panics() {
    let t = setup();
    let user = Address::generate(&t.env);

    t.client.mint(&user, &1_000_000);
    t.client.transfer(&user, &t.pool1, &0);
}

// ---------------------------------------------------------------------------
// Esnaf (Merchant) Testleri — v2: Müşteri→Esnaf Ödeme
// ---------------------------------------------------------------------------

#[test]
fn test_register_merchant_success() {
    let t = setup();
    let merchant = Address::generate(&t.env);

    assert_eq!(t.client.is_merchant(&merchant), false);
    t.client.register_merchant(&merchant);
    assert_eq!(t.client.is_merchant(&merchant), true);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_double_register_merchant_panics() {
    let t = setup();
    let merchant = Address::generate(&t.env);

    t.client.register_merchant(&merchant);
    // İkinci kayıt → AlreadyRegisteredMerchant (#9)
    t.client.register_merchant(&merchant);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_register_pool_address_as_merchant_panics() {
    let t = setup();
    // Bir havuz adresi asla esnaf olarak kaydedilemez → AlreadyRegisteredMerchant (#9)
    t.client.register_merchant(&t.pool1);
}

#[test]
fn test_transfer_customer_to_merchant_success() {
    let t = setup();
    let customer = Address::generate(&t.env);
    let merchant = Address::generate(&t.env);

    t.client.register_merchant(&merchant);
    t.client.mint(&customer, &10_000_000);
    t.client.transfer(&customer, &merchant, &4_000_000);

    assert_eq!(t.client.balance(&customer), 6_000_000);
    assert_eq!(t.client.balance(&merchant), 4_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_transfer_merchant_cannot_send_panics() {
    let t = setup();
    let merchant = Address::generate(&t.env);

    t.client.register_merchant(&merchant);
    t.client.mint(&merchant, &10_000_000);

    // Esnaf, kayıtlı bir havuza bile gönderemez → MerchantCannotSend (#8)
    t.client.transfer(&merchant, &t.pool1, &1_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_transfer_to_unregistered_merchant_still_blocked() {
    let t = setup();
    let customer = Address::generate(&t.env);
    let not_a_merchant = Address::generate(&t.env); // hiç kayıt edilmedi

    t.client.mint(&customer, &10_000_000);

    // Kayıtsız/anonim adrese transfer — v2 sonrası da hâlâ reddedilir → UnauthorizedRecipient (#2)
    t.client.transfer(&customer, &not_a_merchant, &1_000_000);
}

// ---------------------------------------------------------------------------
// Bakiye Testleri
// ---------------------------------------------------------------------------

#[test]
fn test_balance_nonexistent_address_returns_zero() {
    let t = setup();
    let unknown = Address::generate(&t.env);
    assert_eq!(t.client.balance(&unknown), 0);
}

// ---------------------------------------------------------------------------
// SEP-41 Devre Dışı Fonksiyonlar
// ---------------------------------------------------------------------------

#[test]
#[should_panic]
fn test_allowance_panics() {
    let t = setup();
    let a = Address::generate(&t.env);
    let b = Address::generate(&t.env);
    t.client.allowance(&a, &b);
}

#[test]
#[should_panic]
fn test_approve_panics() {
    let t = setup();
    let a = Address::generate(&t.env);
    let b = Address::generate(&t.env);
    t.client.approve(&a, &b, &100, &1000);
}

#[test]
#[should_panic]
fn test_transfer_from_panics() {
    let t = setup();
    let a = Address::generate(&t.env);
    let b = Address::generate(&t.env);
    let c = Address::generate(&t.env);
    t.client.transfer_from(&a, &b, &c, &100);
}

// ---------------------------------------------------------------------------
// Havuz Tipi Doğrulama Testleri
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_invalid_pool_type_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(DtlToken, ());
    let client = DtlTokenClient::new(&env, &contract_id);

    let admin = Address::generate(&env);

    // Havuz 2'yi yanlış tipte (SorobanAddress) verirsek → InvalidPoolType (#7)
    let pools = vec![
        &env,
        PoolEntry {
            pool_id: PoolId::Liquidity,
            address: Address::generate(&env),
            address_type: PoolAddressType::SorobanAddress,
        },
        PoolEntry {
            pool_id: PoolId::GasSponsor,
            address: Address::generate(&env),
            address_type: PoolAddressType::SorobanAddress, // YANLIŞ — StellarAccount olmalı
        },
        PoolEntry {
            pool_id: PoolId::SocialFund,
            address: Address::generate(&env),
            address_type: PoolAddressType::SorobanAddress,
        },
        PoolEntry {
            pool_id: PoolId::Operational,
            address: Address::generate(&env),
            address_type: PoolAddressType::SorobanAddress,
        },
    ];

    client.initialize(
        &admin,
        &String::from_str(&env, "Test"),
        &String::from_str(&env, "TST"),
        &7u32,
        &pools,
    );
}
