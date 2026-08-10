//! Pool manager hata kodları.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PoolManagerError {
    /// Kontrat zaten başlatılmış.
    AlreadyInitialized = 200,

    /// Kontrat henüz başlatılmamış.
    NotInitialized = 201,

    /// Dağıtılacak tutar sıfır veya negatif.
    InvalidAmount = 202,

    /// dTL token kontratına cross-contract çağrı başarısız.
    TokenCallFailed = 203,

    /// Dağılım oranları toplamı 1000'e eşit değil (bütünlük kontrolü).
    RatioIntegrityError = 204,

    /// Çağrıcı yetkili değil.
    Unauthorized = 205,
}
