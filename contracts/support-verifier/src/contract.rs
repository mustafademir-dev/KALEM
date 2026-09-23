//! Sosyal Fon hak ediş doğrulayıcısı.
//!
//! **PARA HAREKET ETMEZ.** Bu kontrat yalnızca bir hak edişin geçerli
//! olduğunu zincir üstünde doğrular ve o dönem için tüketildiğini kaydeder.
//! Ödemenin icrası kapsam dışıdır — gerekçesi `zk/README.md` §5'te.

use soroban_sdk::{
    contract, contractimpl, crypto::bls12_381::Bls12381Fr, panic_with_error, symbol_short,
    xdr::ToXdr, Address, BytesN, Env, Vec,
};

use crate::errors::VerifierError;
use crate::groth16;
use crate::storage_types::{
    ClaimVerified, Proof, VerifierKey, VerifyingKey, INSTANCE_BUMP_AMOUNT,
    INSTANCE_LIFETIME_THRESHOLD, NULLIFIER_BUMP_AMOUNT, NULLIFIER_LIFETIME_THRESHOLD,
};

/// Devrenin açık girdi sayısı: nullifierHash, root, period, recipient.
/// Doğrulama anahtarındaki IC uzunluğu bundan bir fazla olmalıdır.
const PUBLIC_INPUT_COUNT: u32 = 4;

#[contract]
pub struct SupportVerifier;

#[contractimpl]
impl SupportVerifier {
    // -----------------------------------------------------------------------
    // Başlatma ve yapılandırma
    // -----------------------------------------------------------------------

    pub fn initialize(env: Env, admin: Address, vk: VerifyingKey) {
        if env.storage().instance().has(&VerifierKey::Initialized) {
            panic_with_error!(&env, VerifierError::AlreadyInitialized);
        }
        if vk.ic.len() != PUBLIC_INPUT_COUNT + 1 {
            panic_with_error!(&env, VerifierError::MalformedVerifyingKey);
        }

        env.storage().instance().set(&VerifierKey::Admin, &admin);
        env.storage().instance().set(&VerifierKey::Vk, &vk);
        env.storage()
            .instance()
            .set(&VerifierKey::Initialized, &true);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }

    /// Kurumun yayımladığı bir hak sahipleri kökünü tanıtır.
    ///
    /// Kök olmadan hiçbir talep kabul edilmez: kök kümesi, "kimin hak sahibi
    /// olduğuna kurum karar verir" ilkesinin zincirdeki karşılığıdır.
    pub fn publish_root(env: Env, root: BytesN<32>) {
        let admin = Self::require_admin(&env);
        admin.require_auth();

        env.storage()
            .instance()
            .set(&VerifierKey::Root(root.clone()), &env.ledger().sequence());
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        env.events()
            .publish((symbol_short!("root"), root), env.ledger().sequence());
    }

    // -----------------------------------------------------------------------
    // Talep
    // -----------------------------------------------------------------------

    /// Bir hak ediş talebini doğrular ve dönem için tüketir.
    ///
    /// Sıra önemlidir: ucuz kontroller önce, pahalı eşleşme kontrolü en sonda.
    /// Eşleşme tek başına talimat bütçesinin büyük bölümünü yer; geçersiz bir
    /// talebi ona kadar taşımanın anlamı yok.
    pub fn submit_claim(
        env: Env,
        claimant: Address,
        proof: Proof,
        nullifier_hash: BytesN<32>,
        root: BytesN<32>,
        period: u64,
        recipient: BytesN<32>,
    ) {
        // 1. Talebi gönderen gerçekten kendisi mi?
        claimant.require_auth();

        // 2. Kanıt bu talebe mi ait? (öne geçme koruması)
        //    `recipient` kanıtın AÇIK girdilerinden biridir; başka bir adresin
        //    kanıtı kopyalanıp buraya gönderilemez.
        let expected = binding_for(&env, &claimant);
        if expected != recipient {
            panic_with_error!(&env, VerifierError::RecipientMismatch);
        }

        // 3. Kök tanınıyor mu?
        if !env
            .storage()
            .instance()
            .has(&VerifierKey::Root(root.clone()))
        {
            panic_with_error!(&env, VerifierError::UnknownRoot);
        }

        // 4. Bu dönem için daha önce talep edilmiş mi?
        let null_key = VerifierKey::Nullifier(nullifier_hash.clone());
        if env.storage().persistent().has(&null_key) {
            panic_with_error!(&env, VerifierError::NullifierAlreadyUsed);
        }

        // 5. Sıfır bilgi ispatı — en pahalı adım, en sonda.
        let vk: VerifyingKey = env
            .storage()
            .instance()
            .get(&VerifierKey::Vk)
            .unwrap_or_else(|| panic_with_error!(&env, VerifierError::NotInitialized));

        // Açık girdi SIRASI devreyle birebir aynı olmalıdır. snarkjs
        // `publicSignals`'ı şöyle sıralar: önce çıktılar, sonra girdiler
        // (bildirim sırasına göre). Devremizde: nullifierHash (çıktı),
        // ardından root, period, recipient.
        let mut inputs: Vec<Bls12381Fr> = Vec::new(&env);
        inputs.push_back(Bls12381Fr::from_bytes(nullifier_hash.clone()));
        inputs.push_back(Bls12381Fr::from_bytes(root.clone()));
        inputs.push_back(Bls12381Fr::from_bytes(Self::u64_to_field(&env, period)));
        inputs.push_back(Bls12381Fr::from_bytes(recipient));

        if !groth16::verify(&env, &vk, &proof, &inputs) {
            panic_with_error!(&env, VerifierError::InvalidProof);
        }

        // 6. Nullifier'ı tüket.
        env.storage().persistent().set(&null_key, &period);
        env.storage().persistent().extend_ttl(
            &null_key,
            NULLIFIER_LIFETIME_THRESHOLD,
            NULLIFIER_BUMP_AMOUNT,
        );

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        // Olayda kişiye dair hiçbir bilgi yok.
        env.events().publish(
            (symbol_short!("claim"), nullifier_hash),
            ClaimVerified {
                root,
                period,
                ledger: env.ledger().sequence(),
            },
        );
    }

    // -----------------------------------------------------------------------
    // Okuma uçları
    // -----------------------------------------------------------------------

    /// Bir nullifier tüketilmiş mi? (istemci, talep öncesi kontrol için)
    pub fn is_nullifier_used(env: Env, nullifier_hash: BytesN<32>) -> bool {
        env.storage()
            .persistent()
            .has(&VerifierKey::Nullifier(nullifier_hash))
    }

    /// Bir kök tanınıyor mu?
    pub fn is_root_known(env: Env, root: BytesN<32>) -> bool {
        env.storage().instance().has(&VerifierKey::Root(root))
    }

    /// Bir adresin kanıtta kullanması gereken `recipient` bağlayıcısı.
    ///
    /// İstemci bunu çağırıp aynı değeri devreye girdi olarak verir; böylece
    /// iki tarafın aynı kuralı uyguladığı garanti edilir ve maskeleme
    /// mantığının JS'te yeniden yazılması gerekmez.
    pub fn recipient_binding(env: Env, who: Address) -> BytesN<32> {
        binding_for(&env, &who)
    }

    // -----------------------------------------------------------------------
    // Yardımcılar
    // -----------------------------------------------------------------------

    fn require_admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&VerifierKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, VerifierError::NotInitialized))
    }

    /// `u64` değeri 32 baytlık big-endian alan elemanına genişletir.
    fn u64_to_field(env: &Env, value: u64) -> BytesN<32> {
        let mut raw = [0u8; 32];
        raw[24..32].copy_from_slice(&value.to_be_bytes());
        BytesN::from_array(env, &raw)
    }
}

/// Adresten `recipient` bağlayıcısını türetir.
///
/// Serbest fonksiyondur çünkü hem kontrat ucundan (istemci sorsun diye) hem
/// de `submit_claim` içinden çağrılır; `#[contractimpl]` bloğundaki bir
/// yöntem imzası dışarıya açılan ABI'ye bağlıdır ve iç çağrı için uygun değil.
fn binding_for(env: &Env, who: &Address) -> BytesN<32> {
    let digest = env.crypto().sha256(&who.clone().to_xdr(env)).to_bytes();

    let mut raw = [0u8; 32];
    digest.copy_into_slice(&mut raw);

    // En anlamlı 3 biti sıfırla. sha256 çıktısı 256 bitliktir ve BLS12-381
    // skaler alanının mertebesi r ~ 2^255'tir; ham digest r'yi aşabilir ve
    // geçersiz bir alan elemanı olurdu. Üst 3 biti düşürmek sonucu 2^253'ün
    // altına indirir, bu da r'den kesinlikle küçüktür.
    raw[0] &= 0x1f;

    BytesN::from_array(env, &raw)
}
