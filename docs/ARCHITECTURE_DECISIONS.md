# KALEM — Mimari Kararlar ve Derleme Dokümantasyonu (ARCHITECTURE_DECISIONS.md)

> Bu belge, KALEM projesinin mimari kararlarını, derleme ortamını ve doğrulanmış test/WASM sonuçlarını içerir.

---

## 1. Modüler Derleme Mimarisi (WSL2 / Ubuntu Integration)

KALEM projesinde **hibrit mimari** benimsenmiştir:
- **`contracts/` (Rust / Soroban)**: Linux (WSL2 / Ubuntu) dosya sisteminde (`~/kalem-contracts`) isolated "derleme laboratuvarı" olarak `stellar-cli` ile derlenir ve doğrulanır. Doğrulanan kaynak kodlar Windows'taki ana repository'ye senkronize edilir.
- **`orchestrator/` (Node.js + MongoDB)** & **`client/` (React Native Expo)**: Windows ortamında tutulur ve çalıştırılır.

---

## 2. SEP-41 Devre Dışı Fonksiyonlar ve Kapalı Devre Güvenlik Doğrulaması

dTL (dijital Türk Lirası test taşıyıcısı), kapalı devre bir varlıktır. Bu nedenle SEP-41 standart token arayüzünün gerektirdiği delegasyon/izin fonksiyonları (`allowance`, `approve`, `transfer_from`) **kasıtlı olarak devre dışı bırakılmış** ve çağrıldıklarında doğrudan panic döndürecek şekilde kodlanmıştır:

### A. Kod İncelemesi (`contracts/dtl-token/src/token.rs` L341-L354)

```rust
/// SEP-41: Allowance sorgulama — dTL için devre dışı.
pub fn allowance(_env: Env, _from: Address, _spender: Address) -> i128 {
    panic!("dTL kapalı devre varliktir: allowance desteklenmez")
}

/// SEP-41: Approve — dTL için devre dışı.
pub fn approve(_env: Env, _from: Address, _spender: Address, _amount: i128, _live_until_ledger: u32) {
    panic!("dTL kapalı devre varliktir: approve desteklenmez")
}

/// SEP-41: Transfer from (delegasyonlu) — dTL için devre dışı.
pub fn transfer_from(_env: Env, _spender: Address, _from: Address, _to: Address, _amount: i128) {
    panic!("dTL kapalı devre varliktir: transfer_from desteklenmez")
}
```

### B. Birim Test Doğrulaması (`contracts/dtl-token/src/test.rs` L294-L320)

```rust
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
```

---

## 3. Derleme ve Test Doğrulama Sonuçları (10 Ağustos 2026)

### A. Soroban WASM Output (`stellar contract build` / `wasm32v1-none`)

#### 1. `kalem_dtl_token.wasm`
- **Dosya Boyutu:** 12,009 bytes (~12 KB)
- **WASM Hash:** `c1ad6c61e0047da8967265b45a4527fdbd5782451b072e6aa45f6507e0e82cc6`
- **Dışa Aktarılan Semboller (12):** `initialize`, `mint`, `burn`, `transfer`, `balance`, `name`, `symbol`, `decimals`, `total_supply`, `allowance`, `approve`, `transfer_from`

#### 2. `kalem_pool_manager.wasm`
- **Dosya Boyutu:** 8,709 bytes (~8.7 KB)
- **WASM Hash:** `115f8a4d46a2cbd4e6048dcd4a1f366e19d7add74fecaac88220099ea0762bb8`
- **Dışa Aktarılan Semboller (3):** `initialize`, `distribute`, `get_config`

---

### B. Birim Test Sonuçları (`cargo test --workspace`)

Toplam **31 birim testi** çalıştırılmış ve **%100 başarı (0 hata)** ile tamamlanmıştır:

```text
running 19 tests in kalem-dtl-token:
- test_initialize_metadata .................... ok
- test_double_initialize_panics .............. ok (should panic)
- test_mint_success ........................... ok
- test_mint_multiple .......................... ok
- test_mint_zero_amount_panics ................ ok (should panic)
- test_mint_negative_amount_panics ............ ok (should panic)
- test_burn_success ........................... ok
- test_burn_insufficient_balance_panics ....... ok (should panic)
- test_transfer_to_pool1_success .............. ok
- test_transfer_to_pool3_success .............. ok
- test_transfer_to_pool4_success .............. ok
- test_transfer_p2p_blocked .................... ok (should panic: UnauthorizedRecipient #2)
- test_transfer_insufficient_balance_panics ... ok (should panic)
- test_transfer_zero_amount_panics ............ ok (should panic)
- test_balance_nonexistent_address_returns_zero ok
- test_allowance_panics ....................... ok (should panic: dTL kapalı devre)
- test_approve_panics ......................... ok (should panic: dTL kapalı devre)
- test_transfer_from_panics .................. ok (should panic: dTL kapalı devre)
- test_invalid_pool_type_panics ............... ok (should panic: InvalidPoolType #7)

test result: ok. 19 passed; 0 failed.

running 6 tests in kalem-pool-manager:
- test_initialize_success ..................... ok
- test_double_initialize_panics .............. ok (should panic)
- test_get_config_returns_correct_addresses ... ok
- test_distribution_ratios_basic .............. ok (%99.6, %0.1, %0.3)
- test_distribution_ratios_large_amount ....... ok
- test_distribution_ratios_rounding ........... ok

test result: ok. 6 passed; 0 failed.

running 6 tests in kalem-shared:
- test_ratios_sum_to_1000 ..................... ok
- test_calculate_distribution_basic ........... ok
- test_calculate_distribution_preserves_total . ok
- test_calculate_distribution_small_amount .... ok
- test_calculate_distribution_zero_panics ..... ok (should panic)
- test_calculate_distribution_negative_panics . ok (should panic)

test result: ok. 6 passed; 0 failed.

TOTAL: 31 passed; 0 failed; 0 ignored.
```
