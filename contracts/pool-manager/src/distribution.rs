//! # Atomik Çok Taraflı Dağılım
//!
//! Tek bir `distribute()` çağrısıyla tahsilat tutarını üç dTL havuzuna
//! atomik olarak böler. Soroban'ın deterministik execution ortamında
//! "Ya Hep Ya Hiç" prensibiyle çalışır — bir havuza transfer başarısız
//! olursa tüm işlem geri alınır (rollback).
//!
//! ## Dağılım Oranları (kalem-shared'dan)
//! - Havuz 1 (Likidite):    996/1000  (%99,6)
//! - Havuz 3 (Sosyal):        1/1000  (%0,1)
//! - Havuz 4 (Operasyonel):   3/1000  (%0,3)
//!
//! ## Havuz 2 Neden Dahil Değil?
//! Havuz 2, XLM tutan klasik bir Stellar hesabıdır (Fee-Bump fee source).
//! dTL dağılımının parçası değildir. Havuz 2'nin XLM beslenmesi,
//! orkestrasyon katmanındaki cron job ile off-chain yürütülür.
//!
//! ## Cross-Contract Invocation
//! `distribute()`, dtl-token kontratının `transfer()` fonksiyonunu
//! `env.invoke_contract()` ile çağırır. dtl-token'ın `transfer()` override'ı,
//! alıcının havuzlardan biri olduğunu zaten doğrulayacağından çift katmanlı
//! güvenlik sağlanır.

use soroban_sdk::{contract, contractimpl, panic_with_error, vec, Address, Env, IntoVal, Symbol};

use crate::errors::PoolManagerError;
use crate::pool_config::{self, PoolConfig};
use crate::storage_types::{PmDataKey, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD};

// ---------------------------------------------------------------------------
// Kontrat Tanımı
// ---------------------------------------------------------------------------

#[contract]
pub struct PoolManager;

// ---------------------------------------------------------------------------
// Kontrat Arayüzü
// ---------------------------------------------------------------------------

#[contractimpl]
impl PoolManager {
    /// Kontratı başlatır. Yalnızca bir kez çağrılabilir.
    ///
    /// # Parametreler
    /// - `admin`: Kontratı yöneten adres.
    /// - `config`: dTL token adresi ve Havuz 1/3/4 adresleri.
    pub fn initialize(env: Env, admin: Address, config: PoolConfig) {
        // 1. AlreadyInitialized kontrolü
        if env.storage().instance().has(&PmDataKey::Initialized) {
            panic_with_error!(&env, PoolManagerError::AlreadyInitialized);
        }

        // 2. Admin yetkilendirmesi
        admin.require_auth();

        // 3. Konfigürasyonu kaydet
        pool_config::store_config(&env, &config);

        // 4. Admin adresini kaydet
        env.storage().instance().set(&PmDataKey::Admin, &admin);

        // 5. Initialized flag
        env.storage()
            .instance()
            .set(&PmDataKey::Initialized, &true);

        // 6. Instance TTL uzat
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    /// Atomik çok taraflı dağılım.
    ///
    /// Tek bir Soroban invocation içinde, `total_amount` dTL'yi
    /// kalem-shared'daki sabit oranlara göre üç havuza böler.
    /// Her bölüm için `dtl-token` kontratının `transfer()` fonksiyonu
    /// cross-contract invocation ile çağrılır.
    ///
    /// dtl-token kontratının `transfer()` override'ı, alıcının
    /// kayıtlı havuzlardan biri olduğunu zaten doğrulayacaktır.
    /// Bu çift katmanlı güvenlik sağlar.
    ///
    /// # Parametreler
    /// - `from`: Gönderen adres (ödeme yapan müşterinin dTL bakiyesi).
    /// - `total_amount`: Toplam tahsilat tutarı (dTL, stroops).
    ///
    /// # Atomiklik
    /// Üç transfer çağrısından herhangi biri başarısız olursa,
    /// Soroban runtime tüm state değişikliklerini geri alır.
    ///
    /// # Dağılım Hesaplama
    /// ```text
    /// pool4_share = total_amount * 3 / 1000       // Operasyonel (%0,3)
    /// pool3_share = total_amount * 1 / 1000       // Sosyal (%0,1)
    /// pool1_share = total_amount - pool3 - pool4  // Likidite (kalan)
    /// ```
    /// Havuz 1 payı son sırada "kalan" olarak hesaplanır;
    /// böylece tamsayı yuvarlama kayıpları Havuz 1'e yansır.
    pub fn distribute(env: Env, from: Address, total_amount: i128) {
        // 1. Gönderen yetkilendirmesi
        from.require_auth();

        // 2. Tutar doğrulaması
        if total_amount <= 0 {
            panic_with_error!(&env, PoolManagerError::InvalidAmount);
        }

        // 3. Konfigürasyonu yükle
        let config = pool_config::load_config(&env);

        // 4. Dağılım paylarını hesapla (kalem-shared yardımcı fonksiyonu)
        let (pool1_share, pool3_share, pool4_share) =
            kalem_shared::calculate_distribution(total_amount);

        // 5. Cross-contract invocation: dtl-token.transfer() × 3
        //    Soroban atomikliği sayesinde, bir çağrı başarısız olursa
        //    tüm state geri alınır.
        let transfer_fn = Symbol::new(&env, "transfer");

        // Havuz 1'e transfer (Likidite — %99,6)
        env.invoke_contract::<()>(
            &config.dtl_token_address,
            &transfer_fn,
            vec![
                &env,
                from.clone().into_val(&env),
                config.pool1_address.clone().into_val(&env),
                pool1_share.into_val(&env),
            ],
        );

        // Havuz 3'e transfer (Sosyal Destek — %0,1)
        env.invoke_contract::<()>(
            &config.dtl_token_address,
            &transfer_fn,
            vec![
                &env,
                from.clone().into_val(&env),
                config.pool3_address.clone().into_val(&env),
                pool3_share.into_val(&env),
            ],
        );

        // Havuz 4'e transfer (Operasyonel — %0,3)
        env.invoke_contract::<()>(
            &config.dtl_token_address,
            &transfer_fn,
            vec![
                &env,
                from.clone().into_val(&env),
                config.pool4_address.clone().into_val(&env),
                pool4_share.into_val(&env),
            ],
        );

        // 6. Instance TTL uzat
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        // 7. Distribute event yayınla
        //    Event data: (total, pool1, pool3, pool4) — orkestrasyon SSE ile dinler
        env.events().publish(
            ("distribute", from),
            (total_amount, pool1_share, pool3_share, pool4_share),
        );
    }

    /// Mevcut konfigürasyonu döner (havuz adresleri ve dTL token adresi).
    pub fn get_config(env: Env) -> PoolConfig {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        pool_config::load_config(&env)
    }
}
