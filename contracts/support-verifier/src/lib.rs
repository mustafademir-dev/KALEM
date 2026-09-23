//! # kalem-support-verifier — Sosyal Fon Hak Ediş Doğrulayıcısı
//!
//! Bir kişinin sosyal destek almaya hak kazandığını, **kimliğini ve gelir
//! durumunu hiç açıklamadan** kanıtlamasını sağlayan sıfır bilgi ispatı
//! doğrulayıcısı.
//!
//! ## Neden bu kontrat var
//!
//! KALEM'de her ödemenin %0,1'i Havuz 3'te (Sosyal Destek Fonu) birikiyor,
//! ama bir dağıtım mekanizması yoktu. Dağıtım yapabilmek için kimin hak
//! ettiğini bilmek gerekir; bunu bilmenin klasik yolu insanlardan gelir
//! belgesi, hane bilgisi, öğrenci belgesi toplamaktır — yani sistemin bugüne
//! kadar bilinçli olarak kaçındığı her şey. Sıfır bilgi ispatı bu ikilemi
//! çözen bilinen tek yoldur: **doğrulama yapılır, veri toplanmaz.**
//!
//! ## PARA HAREKET ETMEZ
//!
//! Bu kontrat bir hak edişi doğrular ve o dönem için tüketildiğini kaydeder.
//! Ödemenin kendisi kapsam DIŞINDADIR ve yapılmamıştır. İki sebebi var:
//!
//! 1. Havuz 3'ün gizli anahtarı orkestrasyon katmanında yok; ayrıca
//!    `dtl-token.transfer()` alıcının kayıtlı havuz ya da kayıtlı esnaf
//!    olmasını şart koşar — sıradan bir vatandaş ikisi de değildir. Mümkün
//!    olan tek yol ihraççının `burn` + `mint` çiftidir ki bu zincirin değil
//!    **ihraççının** eylemidir.
//! 2. Havuz 3 ile Havuz 4 bakiyelerinin oranı tam 1:3'tür ve bu, dağılım
//!    oranlarının gerçekten zincirde uygulandığının en güçlü kanıtıdır.
//!    Havuz 3'ten para çıktığı anda o eşitlik bozulur.
//!
//! Doğru cümle şudur: *"Mekanizmayı kurduk ve zincirde doğruladık;
//! dağıtımı gerçekten yapmadık."*
//!
//! ## Neden zincir, neden veritabanı değil
//!
//! Doğrulamayı bir kurum değil **kontrat** yapar. Bir veritabanı bunu
//! yapamaz: orada doğrulamayı yapan taraf, güvenmeniz gereken taraftır.
//! Eşleşme kontrolü Soroban'ın yerleşik BLS12-381 host fonksiyonlarıyla
//! (CAP-0059) tek bir çağrıda yapılır; aynı işlem WASM içinde saf Rust ile
//! yapılsaydı talimat bütçesine sığmazdı.
//!
//! ## Nullifier
//!
//! `nullifierHash = Poseidon(nullifier, period)` — aynı kişi aynı dönemde
//! ikinci kez talep ederse aynı değer çıkar ve reddedilir; sonraki dönemde
//! farklı değer çıkar ve talep geçerlidir. Değerden kişiye geri gidilemez.
//! Zincir "bu kişi bu dönemde bir kez talep etti" bilgisini tutar, "bu kişi
//! kim" bilgisini tutmaz.
//!
//! Devre, artefaktlar ve dürüstlük notları: `zk/README.md`.

#![no_std]

mod contract;

#[cfg(test)]
mod fixtures;
mod errors;
mod groth16;
mod storage_types;

#[cfg(test)]
mod test;

pub use errors::VerifierError;
pub use storage_types::{Proof, VerifyingKey};
