//! # dTL Token Fonksiyonları
//!
//! Soroban Custom Token olarak dTL'nin temel yaşam döngüsü:
//! - `initialize`: Kontratı başlatır (admin, metadata, havuz adresleri).
//! - `mint`: İhraççı tarafından yeni dTL basılır (1:1 fiat karşılıklı).
//! - `burn`: İhraççı tarafından dTL yakılır (Havuz 4 → ihraççı → burn akışı).
//! - `transfer`: **OVERRIDE** — Alıcı yalnızca 4 havuzdan biri olabilir.
//!   P2P transfer sözleşme seviyesinde bloklanmıştır.
//! - `balance`: Adres bazlı dTL bakiye sorgulama.
//!
//! ## SEP-41 Uyumluluk
//! `allowance()`, `approve()`, `transfer_from()` fonksiyonları SEP-41
//! arayüz uyumluluğu için mevcuttur ancak kasıtlı olarak panic döndürür.
//! dTL kapalı devre bir varlıktır; delegasyon mekanizması anlamsızdır.
//!
//! ## Kritik Kısıt
//! dTL, Stellar native asset değildir. Trustline mekanizması KULLANILMAZ.
//! Transfer kısıtlaması tamamen bu sözleşmenin `transfer()` fonksiyonunda
//! uygulanan business logic ile sağlanır.

use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, String, Vec};

use crate::auth;
use crate::errors::TokenError;
use crate::pool_registry::{self, PoolEntry};
use crate::storage_types::{
    DataKey, BALANCE_BUMP_AMOUNT, BALANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT,
    INSTANCE_LIFETIME_THRESHOLD,
};

// ---------------------------------------------------------------------------
// Bakiye Yardımcı Fonksiyonları (Private)
// ---------------------------------------------------------------------------

/// Belirtilen adresin dTL bakiyesini okur. Kayıt yoksa 0 döner.
fn read_balance(env: &Env, addr: &Address) -> i128 {
    let key = DataKey::Balance(addr.clone());
    if let Some(balance) = env.storage().persistent().get::<DataKey, i128>(&key) {
        // TTL'yi yenile
        env.storage()
            .persistent()
            .extend_ttl(&key, BALANCE_LIFETIME_THRESHOLD, BALANCE_BUMP_AMOUNT);
        balance
    } else {
        0
    }
}

/// Belirtilen adresin dTL bakiyesini yazar.
fn write_balance(env: &Env, addr: &Address, amount: i128) {
    let key = DataKey::Balance(addr.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, BALANCE_LIFETIME_THRESHOLD, BALANCE_BUMP_AMOUNT);
}

/// Gönderenin bakiyesinden tutar düşer. Yetersiz bakiye kontrolü yapar.
fn spend_balance(env: &Env, addr: &Address, amount: i128) {
    let balance = read_balance(env, addr);
    if balance < amount {
        panic_with_error!(env, TokenError::InsufficientBalance);
    }
    write_balance(env, addr, balance - amount);
}

/// Alıcının bakiyesine tutar ekler.
fn receive_balance(env: &Env, addr: &Address, amount: i128) {
    let balance = read_balance(env, addr);
    write_balance(env, addr, balance + amount);
}

/// Toplam arz (total supply) okur. Kayıt yoksa 0 döner.
fn read_total_supply(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get::<DataKey, i128>(&DataKey::TotalSupply)
        .unwrap_or(0)
}

/// Toplam arzı günceller.
fn write_total_supply(env: &Env, supply: i128) {
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &supply);
}

/// Tutar doğrulaması: sıfır veya negatif ise panic.
fn check_positive_amount(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, TokenError::InvalidAmount);
    }
}

// ---------------------------------------------------------------------------
// Kontrat Tanımı
// ---------------------------------------------------------------------------

#[contract]
pub struct DtlToken;

// ---------------------------------------------------------------------------
// Kontrat Arayüzü
// ---------------------------------------------------------------------------

#[contractimpl]
impl DtlToken {
    // -----------------------------------------------------------------------
    // Başlatma
    // -----------------------------------------------------------------------

    /// Kontratı başlatır. Yalnızca bir kez çağrılabilir.
    ///
    /// # Parametreler
    /// - `admin`: İhraççı adresi (mint/burn yetkisi).
    /// - `name`: Token adı (ör. "Dijital Türk Lirası Test").
    /// - `symbol`: Token sembolü (ör. "dTL").
    /// - `decimal`: Ondalık basamak sayısı (ör. 7, Stellar standardı).
    /// - `pools`: Dört havuzun adres ve tip bilgisi.
    pub fn initialize(
        env: Env,
        admin: Address,
        name: String,
        symbol: String,
        decimal: u32,
        pools: Vec<PoolEntry>,
    ) {
        // 1. AlreadyInitialized kontrolü
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(&env, TokenError::AlreadyInitialized);
        }

        // 2. Admin kaydı
        auth::set_admin(&env, &admin);

        // 3. Token metadata'yı storage'a yaz
        env.storage().instance().set(&DataKey::TokenName, &name);
        env.storage().instance().set(&DataKey::TokenSymbol, &symbol);
        env.storage()
            .instance()
            .set(&DataKey::TokenDecimal, &decimal);

        // 4. Toplam arz başlangıçta 0
        write_total_supply(&env, 0);

        // 5. Havuz adreslerini kaydet ve doğrula
        //    - Havuz 2'nin PoolAddressType::StellarAccount olduğu doğrulanır
        //    - Havuz 1/3/4'ün PoolAddressType::SorobanAddress olduğu doğrulanır
        pool_registry::register_pools(&env, &pools);

        // 6. Initialized flag
        env.storage()
            .instance()
            .set(&DataKey::Initialized, &true);

        // 7. Instance storage TTL uzat
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    // -----------------------------------------------------------------------
    // Mint (İhraç)
    // -----------------------------------------------------------------------

    /// Yeni dTL basar. Yalnızca ihraççı (admin) çağırabilir.
    ///
    /// Off-chain'de lisanslı kuruluşun bloke hesabına 1:1 TL yatırıldıktan
    /// sonra, orkestrasyon katmanı bu fonksiyonu tetikler.
    ///
    /// # Parametreler
    /// - `to`: dTL'nin basılacağı hedef adres.
    /// - `amount`: Basılacak dTL tutarı (stroops cinsinden).
    pub fn mint(env: Env, to: Address, amount: i128) {
        // 1. İhraççı yetki kontrolü
        let admin = auth::get_admin(&env);
        auth::require_admin(&env, &admin);

        // 2. Tutar doğrulaması
        check_positive_amount(&env, amount);

        // 3. Bakiye güncelle
        receive_balance(&env, &to, amount);

        // 4. Toplam arz güncelle
        let supply = read_total_supply(&env);
        write_total_supply(&env, supply + amount);

        // 5. Instance TTL uzat
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        // 6. Mint event yayınla
        env.events()
            .publish(("mint", admin, to), amount);
    }

    // -----------------------------------------------------------------------
    // Burn (Yakma)
    // -----------------------------------------------------------------------

    /// dTL yakar. Yalnızca ihraççı (admin) çağırabilir.
    ///
    /// Havuz 4 → ihraççı akışında; ihraççı dTL'yi alır ve bu fonksiyonla
    /// yakar. Karşılığı off-chain'de TL'ye çevrilir, sonra XLM temin
    /// edilip Havuz 2'ye enjekte edilir.
    ///
    /// # Parametreler
    /// - `from`: dTL'nin yakılacağı kaynak adres (genellikle ihraççının kendi adresi).
    /// - `amount`: Yakılacak dTL tutarı.
    pub fn burn(env: Env, from: Address, amount: i128) {
        // 1. İhraççı yetki kontrolü
        let admin = auth::get_admin(&env);
        auth::require_admin(&env, &admin);

        // 2. Tutar doğrulaması
        check_positive_amount(&env, amount);

        // 3. Bakiye kontrolü ve düşürme
        spend_balance(&env, &from, amount);

        // 4. Toplam arz güncelle
        let supply = read_total_supply(&env);
        write_total_supply(&env, supply - amount);

        // 5. Instance TTL uzat
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        // 6. Burn event yayınla
        env.events()
            .publish(("burn", admin, from), amount);
    }

    // -----------------------------------------------------------------------
    // Transfer (OVERRIDE — P2P Blokaj)
    // -----------------------------------------------------------------------

    /// dTL transferi. **OVERRIDE EDİLMİŞTİR.**
    ///
    /// Standart bir token transfer fonksiyonundan farklı olarak, alıcı
    /// (`to`) adresinin `pool_registry`'de kayıtlı 4 havuzdan biri olup
    /// olmadığını kontrol eder. Eğer alıcı havuzlardan biri değilse
    /// (ör. esnaftan esnafa P2P transfer) işlem `UnauthorizedRecipient`
    /// hatası ile reddedilir.
    ///
    /// Bu, dTL'nin kapalı devre doğasını sözleşme seviyesinde garanti eder.
    ///
    /// # Parametreler
    /// - `from`: Gönderen adres (ödeme yapan müşteri/esnaf).
    /// - `to`: Alıcı adres — YALNIZCA Havuz 1, 2, 3 veya 4 olabilir.
    /// - `amount`: Transfer tutarı.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        // 1. Gönderen yetkilendirmesi
        from.require_auth();

        // 2. Tutar doğrulaması
        check_positive_amount(&env, amount);

        // 3. *** P2P BLOKAJ ***
        //    Alıcı adresin kayıtlı havuzlardan biri olup olmadığını kontrol et.
        //    Değilse → UnauthorizedRecipient hatası ile reddet.
        if !pool_registry::is_authorized_recipient(&env, &to) {
            panic_with_error!(&env, TokenError::UnauthorizedRecipient);
        }

        // 4. Bakiye kontrolü ve transfer
        spend_balance(&env, &from, amount);
        receive_balance(&env, &to, amount);

        // 5. Instance TTL uzat
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        // 6. Transfer event yayınla
        env.events()
            .publish(("transfer", from, to), amount);
    }

    // -----------------------------------------------------------------------
    // Bakiye Sorgulama
    // -----------------------------------------------------------------------

    /// Belirtilen adresin dTL bakiyesini döner.
    pub fn balance(env: Env, address: Address) -> i128 {
        // Instance TTL uzat (okuma sırasında da)
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        read_balance(&env, &address)
    }

    // -----------------------------------------------------------------------
    // Metadata
    // -----------------------------------------------------------------------

    /// Token adını döner.
    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::TokenName)
            .unwrap_or_else(|| panic_with_error!(&env, TokenError::NotInitialized))
    }

    /// Token sembolünü döner.
    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::TokenSymbol)
            .unwrap_or_else(|| panic_with_error!(&env, TokenError::NotInitialized))
    }

    /// Ondalık basamak sayısını döner.
    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::TokenDecimal)
            .unwrap_or_else(|| panic_with_error!(&env, TokenError::NotInitialized))
    }

    /// Toplam dTL arzını döner.
    pub fn total_supply(env: Env) -> i128 {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        read_total_supply(&env)
    }

    // -----------------------------------------------------------------------
    // SEP-41 Uyumluluk (Kasıtlı Devre Dışı)
    // -----------------------------------------------------------------------
    // Bu fonksiyonlar, cüzdanlar ve explorer'lar için SEP-41 arayüz
    // uyumluluğu sağlar. Ancak dTL kapalı devre bir varlık olduğundan
    // allowance/approve/transfer_from mekanizması anlamsızdır.
    // Çağrıldığında kasıtlı olarak panic döndürürler.

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
}
