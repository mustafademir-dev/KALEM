//! # kalem-pool-manager
//!
//! Atomik çok taraflı dağılım kontratı. Tek bir `distribute()` çağrısıyla
//! tahsilat tutarını Havuz 1, 3 ve 4'e "Ya Hep Ya Hiç" prensibiyle dağıtır.
//!
//! ## Sorumluluk
//! - `dtl-token` kontratını cross-contract invocation ile çağırır.
//! - Dağılım oranlarını `kalem-shared` sabitlerinden alır.
//! - Havuz 2'ye (XLM/Gaz Sponsor) dokunmaz; Havuz 2 beslemesi off-chain'dir.
//!
//! ## Modüller
//! - `distribution`: Atomik dağılım mantığı
//! - `pool_config`: Havuz adresleri ve dTL token kontrat referansı
//! - `storage_types`: Storage key tanımları ve TTL sabitleri
//! - `errors`: Kontrat hata kodları

#![no_std]

mod distribution;
mod errors;
mod pool_config;
mod storage_types;

#[cfg(test)]
mod test;

pub use errors::PoolManagerError;
