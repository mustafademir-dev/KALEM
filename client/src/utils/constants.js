/**
 * İstemci Sabitleri
 */

/**
 * Orkestrasyon katmanı base URL'i.
 *
 * `client/.env` dosyasındaki `EXPO_PUBLIC_ORCHESTRATOR_BASE_URL` ile ezilir;
 * tanımlı değilse yerel geliştirme adresine düşer. Bulut dağıtımında (Render)
 * bu değişken servisin gerçek adresine ayarlanmalıdır — bkz.
 * `client/.env.example` ve docs/ARCHITECTURE_DECISIONS.md §6.6.
 *
 * DİKKAT: `EXPO_PUBLIC_*` değişkenleri **derleme anında** paketin içine gömülür,
 * çalışma anında okunmaz. Değeri değiştirdikten sonra Expo dev sunucusunu
 * yeniden başlatmak (veya web build'i yeniden almak) GEREKİR — yoksa eski
 * adres paketin içinde kalmaya devam eder.
 *
 * Sondaki `/` karakteri temizlenir: `api.service.js` yolları `/api/v1/...`
 * şeklinde ekliyor, aksi halde `//api/v1/...` oluşurdu.
 */
export const ORCHESTRATOR_BASE_URL = (
  process.env.EXPO_PUBLIC_ORCHESTRATOR_BASE_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

/** Stellar ağ ayarları (istemci tarafında yalnızca XDR oluşturma ve doğrudan zincir okuması için). */
export const STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
export const HORIZON_URL = 'https://horizon-testnet.stellar.org';
export const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

/**
 * Testnet Friendbot — yeni bir Stellar classic hesabını (100000 XLM testnet
 * parasıyla) fonlar. YALNIZCA testnet'te vardır, mainnet'te KARŞILIĞI YOKTUR
 * (bkz. docs/ARCHITECTURE_DECISIONS.md §6.7) — gerçek dağıtımda bu adımın
 * TAMAMEN kaldırılıp yerine gerçek bir hesap fonlama stratejisi konması gerekir.
 */
export const FRIENDBOT_URL = 'https://friendbot.stellar.org';

/**
 * Deploy edilmiş kontrat ID'leri (testnet, v2 — Müşteri→Esnaf Ödeme).
 * Kaynak: docs/ARCHITECTURE_DECISIONS.md §7.2 (commit edilmiş, gizli değil —
 * yalnızca POOL2_SECRET_KEY/ISSUER_SECRET_KEY gizlidir, bunlar client'a hiç girmez).
 */
export const DTL_TOKEN_CONTRACT_ID = 'CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO';
export const POOL_MANAGER_CONTRACT_ID = 'CDR7WMMQLINNIC2PCSWUU27FHUWWLZPHBJU7MQK5EZVOJBIWQA47LQSA';

/** dTL biriminin ondalık hassasiyeti (bkz. utils/format.js). */
export const DTL_DECIMALS = 7;

/** Esnaf QR kodlarının başında bulunması beklenen sürüm etiketi (bkz. utils/qrPayload.js). */
export const QR_SCHEME_TAG = 'KALEM-PAY-V1';

/** SecureStore anahtarı — müşteri cüzdanının Ed25519 gizli anahtarı. */
export const WALLET_SECRET_STORAGE_KEY = 'kalem_wallet_secret_v1';

/** SecureStore anahtarı — esnaf oturumu (merchantId + API anahtarı + görünen ad). */
export const MERCHANT_SESSION_STORAGE_KEY = 'kalem_merchant_session_v1';
