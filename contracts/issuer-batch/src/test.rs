//! issuer-batch birim testleri — GERÇEK dtl-token WASM'ına karşı.
//!
//! dtl-token taklit edilmez: derlenmiş WASM'ı içe aktarılır, böylece yetki
//! (ihraççı imzası) ve atomiklik gerçek token kurallarıyla sınanır.
//! Önce: `stellar contract build` (dtl-token WASM'ı üretilmiş olmalı).

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
    vec, Address, Env, IntoVal, String, Symbol, Vec,
};

use crate::{IssuerBatch, IssuerBatchClient};

mod dtl {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/kalem_dtl_token.wasm");
}

struct Setup {
    env: Env,
    token: dtl::Client<'static>,
    batch: IssuerBatchClient<'static>,
    admin: Address,
    merchant: Address,
    pool3: Address,
    pool4: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let pools: [Address; 4] = core::array::from_fn(|_| Address::generate(&env));
    let token_id = env.register(dtl::WASM, ());
    let token = dtl::Client::new(&env, &token_id);
    token.initialize(
        &admin,
        &String::from_str(&env, "Dijital Türk Lirası Test"),
        &String::from_str(&env, "dTL"),
        &7,
        &vec![
            &env,
            dtl::PoolEntry { pool_id: dtl::PoolId::Liquidity, address: pools[0].clone(), address_type: dtl::PoolAddressType::SorobanAddress },
            dtl::PoolEntry { pool_id: dtl::PoolId::GasSponsor, address: pools[1].clone(), address_type: dtl::PoolAddressType::StellarAccount },
            dtl::PoolEntry { pool_id: dtl::PoolId::SocialFund, address: pools[2].clone(), address_type: dtl::PoolAddressType::SorobanAddress },
            dtl::PoolEntry { pool_id: dtl::PoolId::Operational, address: pools[3].clone(), address_type: dtl::PoolAddressType::SorobanAddress },
        ],
    );
    let merchant = Address::generate(&env);
    token.register_merchant(&merchant);

    let batch_id = env.register(IssuerBatch, ());
    let batch = IssuerBatchClient::new(&env, &batch_id);
    Setup { pool3: pools[2].clone(), pool4: pools[3].clone(), env, token, batch, admin, merchant }
}

/// Müşteri → esnaf 10 dTL ödemesini gerçek token üzerinde kurar (9,96 / 0,01 / 0,03).
fn pay(s: &Setup, customer: &Address) {
    s.token.mint(customer, &100_000_000);
    s.token.transfer(customer, &s.merchant, &99_600_000);
    s.token.transfer(customer, &s.pool3, &100_000);
    s.token.transfer(customer, &s.pool4, &300_000);
}

#[test]
fn iade_tek_islemde_tamamlanir_ve_arz_degismez() {
    let s = setup();
    let customer = Address::generate(&s.env);
    pay(&s, &customer);
    let supply_before = s.token.total_supply();

    s.batch.run(
        &s.token.address,
        &s.admin,
        &vec![&s.env, (s.merchant.clone(), 99_600_000i128), (s.pool3.clone(), 100_000), (s.pool4.clone(), 300_000)],
        &vec![&s.env, (customer.clone(), 100_000_000i128)],
    );

    assert_eq!(s.token.balance(&customer), 100_000_000);
    assert_eq!(s.token.balance(&s.merchant), 0);
    assert_eq!(s.token.balance(&s.pool3), 0);
    assert_eq!(s.token.balance(&s.pool4), 0);
    assert_eq!(s.token.total_supply(), supply_before);
}

#[test]
fn yalnizca_ihraccinin_imzasi_istenir_ve_alt_cagrilari_kapsar() {
    let s = setup();
    let old = Address::generate(&s.env);
    let new = Address::generate(&s.env);
    s.token.mint(&old, &50);

    let burns = vec![&s.env, (old.clone(), 50i128)];
    let mints = vec![&s.env, (new.clone(), 50i128)];
    s.batch.run(&s.token.address, &s.admin, &burns, &mints);

    // Tek imza: ihraççı; kök çağrı batch.run, burn ve mint onun alt çağrıları.
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    let (addr, invocation) = &auths[0];
    assert_eq!(addr, &s.admin);
    assert_eq!(
        invocation,
        &AuthorizedInvocation {
            function: AuthorizedFunction::Contract((
                s.batch.address.clone(),
                Symbol::new(&s.env, "run"),
                (s.token.address.clone(), s.admin.clone(), burns.clone(), mints.clone()).into_val(&s.env),
            )),
            sub_invocations: std::vec![
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        s.token.address.clone(),
                        Symbol::new(&s.env, "burn"),
                        (old.clone(), 50i128).into_val(&s.env),
                    )),
                    sub_invocations: std::vec![],
                },
                AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        s.token.address.clone(),
                        Symbol::new(&s.env, "mint"),
                        (new.clone(), 50i128).into_val(&s.env),
                    )),
                    sub_invocations: std::vec![],
                },
            ],
        }
    );
    assert_eq!(s.token.balance(&old), 0);
    assert_eq!(s.token.balance(&new), 50);
}

#[test]
fn bir_adim_basarisizsa_hicbiri_olmaz() {
    let s = setup();
    let customer = Address::generate(&s.env);
    pay(&s, &customer);

    // Havuz 4'te yalnızca 300_000 var; fazlası istenince tüm işlem geri alınmalı.
    let result = s.batch.try_run(
        &s.token.address,
        &s.admin,
        &vec![&s.env, (s.merchant.clone(), 99_600_000i128), (s.pool4.clone(), 999_999_999)],
        &vec![&s.env, (customer.clone(), 100_000_000i128)],
    );
    assert!(result.is_err());
    assert_eq!(s.token.balance(&s.merchant), 99_600_000);
    assert_eq!(s.token.balance(&customer), 0);
}

#[test]
fn ihracci_olmayan_admin_reddedilir() {
    let s = setup();
    let impostor = Address::generate(&s.env);
    let victim = Address::generate(&s.env);
    s.token.mint(&victim, &10);

    let result = s.batch.try_run(
        &s.token.address,
        &impostor,
        &vec![&s.env, (victim.clone(), 10i128)],
        &Vec::new(&s.env),
    );
    assert!(result.is_err());
    assert_eq!(s.token.balance(&victim), 10);
}
