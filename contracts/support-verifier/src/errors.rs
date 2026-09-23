//! Hata kodları.
//!
//! Kod aralığı 400-499: dtl-token 1-99, pool-manager 200-299 kullanıyor;
//! çakışma olmasın diye ayrı blok.

use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VerifierError {
    /// Kontrat zaten başlatılmış.
    AlreadyInitialized = 400,

    /// Kontrat henüz başlatılmamış.
    NotInitialized = 401,

    /// Doğrulama anahtarındaki IC uzunluğu açık girdi sayısıyla uyuşmuyor.
    MalformedVerifyingKey = 402,

    /// Talebin dayandığı kök bu kontratta tanınmıyor. Kurum onu hiç
    /// yayımlamamış ya da yanlış kök gönderilmiş demektir.
    UnknownRoot = 403,

    /// Bu nullifier daha önce tüketilmiş — aynı kişi aynı dönemde ikinci
    /// kez talep ediyor.
    NullifierAlreadyUsed = 404,

    /// Sıfır bilgi ispatı doğrulanamadı.
    InvalidProof = 405,

    /// Kanıttaki `recipient` bağlayıcısı, işlemi imzalayan adresten
    /// türetilen değerle eşleşmiyor. Başkasının kanıtı kopyalanmış olabilir.
    RecipientMismatch = 406,
}
