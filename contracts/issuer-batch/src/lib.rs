//! # kalem-issuer-batch
//!
//! İhraççının birden çok `burn`/`mint` işlemini **tek bir işlemde, atomik**
//! çalıştıran yardımcı kontrat.
//!
//! ## Neden var
//! İade (esnaf + Havuz 3 + Havuz 4'ten burn, müşteriye mint) ve cihaz değişimi
//! (eski cüzdandan burn, yeni cüzdana mint) önceden ayrı ayrı işlemlerdi. Soroban
//! işlemi tek bir kontrat çağrısı taşıdığı için her adım ayrı bir ledger kapanışı
//! (~5 sn) bekliyordu ve arada yarıda kalabiliyordu. Bu kontrat adımları tek
//! çağrıda toplar: ya hepsi olur ya hiçbiri.
//!
//! ## Yetki
//! Kontratın kendi yetkisi, deposu ve admin'i YOKTUR. `run`, verilen `admin`
//! adresinin imzasını ister; asıl kontrol dtl-token'dadır: `burn`/`mint` yalnızca
//! token'da kayıtlı ihraççının yetkisiyle çalışır. Başka bir adresle çağrılırsa
//! token `UnauthorizedIssuer` ile reddeder. Yani bu kontrat ihraççıya yeni bir
//! yetki vermez, yalnızca mevcut yetkisini tek işlemde kullanmasını sağlar.
//!
//! dtl-token ve pool-manager DEĞİŞMEDİ, yeniden deploy EDİLMEDİ.

#![no_std]

use soroban_sdk::{contract, contractimpl, vec, Address, Env, IntoVal, Symbol, Vec};

#[contract]
pub struct IssuerBatch;

#[contractimpl]
impl IssuerBatch {
    /// Önce tüm `burns`, sonra tüm `mints` — tek işlemde, atomik.
    ///
    /// # Parametreler
    /// - `token`: dtl-token kontrat adresi.
    /// - `admin`: dtl-token'ın ihraççısı (imzası istenir).
    /// - `burns`: `(adres, tutar)` listesi — her biri için `token.burn(adres, tutar)`.
    /// - `mints`: `(adres, tutar)` listesi — her biri için `token.mint(adres, tutar)`.
    ///
    /// Herhangi bir adım başarısız olursa (yetersiz bakiye, sıfır tutar, yetkisiz
    /// ihraççı) Soroban tüm durumu geri alır.
    pub fn run(
        env: Env,
        token: Address,
        admin: Address,
        burns: Vec<(Address, i128)>,
        mints: Vec<(Address, i128)>,
    ) {
        // Kök yetki: token'daki burn/mint'in admin.require_auth() çağrıları bu
        // çağrının alt çağrıları olarak aynı imzayla karşılanır.
        admin.require_auth();

        let burn_fn = Symbol::new(&env, "burn");
        for (from, amount) in burns.iter() {
            env.invoke_contract::<()>(
                &token,
                &burn_fn,
                vec![&env, from.into_val(&env), amount.into_val(&env)],
            );
        }

        let mint_fn = Symbol::new(&env, "mint");
        for (to, amount) in mints.iter() {
            env.invoke_contract::<()>(
                &token,
                &mint_fn,
                vec![&env, to.into_val(&env), amount.into_val(&env)],
            );
        }
    }
}

#[cfg(test)]
mod test;
