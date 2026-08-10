//! dTL Token kontratı hata kodları.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    // --- Yetki Hataları ---
    /// Çağrıcı, ihraççı (admin) değil. Mint/burn işlemi reddedildi.
    UnauthorizedIssuer = 1,

    // --- Transfer Kısıtlama Hataları ---
    /// Alıcı adres, tanımlı 4 havuzdan biri değil.
    /// P2P (esnaftan esnafa) transfer sözleşme seviyesinde YASAKTIR.
    UnauthorizedRecipient = 2,

    // --- Bakiye Hataları ---
    /// Gönderenin bakiyesi yetersiz.
    InsufficientBalance = 3,

    // --- Genel ---
    /// Transfer/mint/burn tutarı sıfır veya negatif.
    InvalidAmount = 4,

    /// Kontrat zaten başlatılmış (initialize tekrar çağrılamaz).
    AlreadyInitialized = 5,

    /// Kontrat henüz başlatılmamış.
    NotInitialized = 6,

    /// Havuz adres tipi beklenen değerle eşleşmiyor.
    /// Ör: Havuz 2 StellarAccount olmalı, Havuz 1/3/4 SorobanAddress olmalı.
    InvalidPoolType = 7,
}
