//! # kalem-dtl-token
//!
//! dTL (dijital Türk Lirası test taşıyıcısı) Soroban Custom Token kontratı.
//!
//! ## Temel Özellikler
//! - **Soroban Custom Token:** Stellar native asset/Trustline değildir.
//! - **P2P Blokaj (v2 ile genişletilmiş):** `transfer()` fonksiyonu override
//!   edilmiştir; alıcı adres yalnızca tanımlı 4 havuzdan biri VEYA kayıtlı
//!   bir esnaf olabilir. Esnaf yalnızca alıcı olabilir, asla gönderen olamaz;
//!   müşteriden müşteriye veya esnaftan esnafa transfer sözleşme seviyesinde
//!   reddedilir. Müşteri kimliği zincirde hiçbir zaman ayrıca kaydedilmez.
//! - **Mint/Burn:** Yalnızca yetkili ihraççı (admin) tarafından çağrılabilir.
//! - **1:1 Fiat Karşılık:** Off-chain lisanslı kuruluş bloke hesabıyla endeksli.
//! - **SEP-41 Arayüz:** Tam arayüz mevcut; `allowance`, `approve`, `transfer_from`
//!   kasıtlı olarak panic döndürür (kapalı devre varlık).
//!
//! ## Modüller
//! - `storage_types`: Storage key tanımları ve TTL sabitleri
//! - `token`: Mint, burn, transfer (override), balance fonksiyonları
//! - `pool_registry`: Yetkili havuz adresleri kaydı (PoolAddressType ayrımı)
//! - `auth`: İhraççı yetki denetimi
//! - `errors`: Kontrat hata kodları

#![no_std]

mod auth;
mod errors;
mod pool_registry;
mod storage_types;
mod token;

#[cfg(test)]
mod test;

pub use errors::TokenError;
pub use pool_registry::{PoolAddressType, PoolEntry, PoolId};
