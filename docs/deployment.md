# KALEM — Testnet Deploy Rehberi

> Bu belge, Soroban kontratlarının Stellar Testnet'e deploy edilme
> sürecini ve orkestrasyon sunucusunun yapılandırılmasını açıklar.

## Ön Koşullar

1. **Stellar CLI** kurulumu:
   ```bash
   cargo install --locked stellar-cli
   ```

2. **Testnet hesabı** oluşturma ve fonlama:
   ```bash
   stellar keys generate --global deployer --network testnet
   stellar keys fund deployer --network testnet
   ```

## Kontrat Deploy Adımları

### 1. Kontratları Derle

```bash
cd contracts
cargo build --target wasm32-unknown-unknown --release
```

### 2. dtl-token Kontratını Deploy Et

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/kalem_dtl_token.wasm \
  --source deployer \
  --network testnet
```

Çıktıdaki kontrat ID'sini not edin → `.env` dosyasına `DTL_TOKEN_CONTRACT_ID` olarak yazın.

### 3. pool-manager Kontratını Deploy Et

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/kalem_pool_manager.wasm \
  --source deployer \
  --network testnet
```

### 4. Kontratları Initialize Et

```bash
# dtl-token initialize
stellar contract invoke \
  --id <DTL_TOKEN_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin <ISSUER_ADDRESS> \
  --name "Dijital Turk Lirasi Test" \
  --symbol "dTL" \
  --decimal 7 \
  --pools '[...]'

# pool-manager initialize
stellar contract invoke \
  --id <POOL_MANAGER_CONTRACT_ID> \
  --source deployer \
  --network testnet \
  -- initialize \
  --admin <ADMIN_ADDRESS> \
  --config '{...}'
```

## Orkestrasyon Sunucusu

```bash
cd orchestrator
npm install
cp .env.example .env
# .env dosyasını deploy edilen kontrat ID'leri ve havuz adresleriyle doldurun
npm run dev
```

## Doğrulama

```bash
# Health check
curl http://localhost:3000/api/v1/health
```

---

# Bulut Dağıtımı — Orkestrasyon Katmanı (Render)

> Kontrat deploy'u yukarıda anlatıldı; bu bölüm `orchestrator/` servisinin bulut
> host'a alınmasını kapsar. Repo kökündeki `render.yaml` bu bölümün makine
> tarafından okunabilir karşılığıdır.

## 1. Ön koşul — MongoDB Atlas erişimi

Render'ın ücretsiz/starter planlarında **sabit çıkış IP'si yoktur**; servisin dış
dünyaya hangi IP'den çıktığı yeniden başlatmalarda değişir. Bu nedenle Atlas'ta
tek bir IP'yi whitelist'e almak işe yaramaz:

1. Atlas → **Network Access** → `0.0.0.0/0` ekleyin (açıklama: "Render PaaS — dinamik çıkış IP").
2. Telafi olarak Atlas → **Database Access** → kullanıcı şifresini uzun ve rastgele bir değerle yenileyin.

Bu, "veritabanı herkese açık" demek değildir — kimlik doğrulama kullanıcı adı +
şifre ile yapılır ve bağlantı TLS'tir. PaaS dağıtımlarında standart yaklaşımdır.

> Şifrede `@ : / ?` gibi karakterler varsa bağlantı dizesinde URL-encode edilmeleri
> gerekir; şifreyi yalnızca harf ve rakamdan seçmek bu sınıf hatayı tamamen önler.

## 2. Servis kurulumu

Render → **New → Blueprint** ile repo seçilirse `render.yaml` otomatik uygulanır.
Elle kurulacaksa (**New → Web Service**):

| Alan | Değer |
| :--- | :--- |
| Root Directory | `orchestrator` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/v1/health` |

**Root Directory mutlaka `orchestrator` olmalıdır** — repo bir monorepo'dur, kökte
`package.json` yoktur.

## 3. Ortam değişkenleri

`orchestrator/.env.example` tam listedir. Yereldekinden **farklı** olacaklar:

| Değişken | Değer | Not |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | |
| `TRUST_PROXY_HOPS` | `3` | 🔴 aşağıdaki uyarıyı okuyun — canlıda ÖLÇÜLDÜ, tahmin değil |
| `PORT` | **girilmez** | Render kendisi enjekte eder |
| `CORS_ALLOWED_ORIGINS` | client'ın tam origin'i | Client yerelde çalışacaksa boş bırakılabilir (§6.6) |

Gizli değerler (`MONGODB_URI`, `POOL2_SECRET_KEY`, `ISSUER_SECRET_KEY`) yalnızca
Render panelinden girilir; `render.yaml`'da `sync: false` ile işaretlidir ve repoya
asla yazılmaz.

`AES_ENCRYPTION_KEY` **girilmesine gerek yoktur** — `utils/crypto.js` içinde
yalnızca yorum satırında geçer, hiçbir kod yolunda kullanılmaz.

### 🔴 `TRUST_PROXY_HOPS` — en kritik ayar

Render, uygulamanın önünde **iki** proxy katmanı çalıştırır (Cloudflare + kendi iç
yük dengeleyicisi) ve Express hop sayarken **soket bağlantısını da** sayar. Canlı
ölçümle bulunan gerçek dizilim:

| Hop | Adres | Nedir |
| :-- | :--- | :--- |
| 0 | `::1` | Render iç proxy'sinin soket bağlantısı |
| 1 | `10.25.111.8` | Render iç yük dengeleyici |
| 2 | `104.23.180.102` | Cloudflare edge |
| 3 | `88.253.38.157` | **gerçek istemci** |

Bu yüzden doğru değer **3**'tür. Yanlış değerlerin sonucu:

- **`1`** (ilk tahmin, canlıda denendi ve YANLIŞ çıktı): `req.ip` = Render'ın iç
  adresi. Bu adres tüm kullanıcılarda ortaktır → limitler "IP başına" değil
  **fiilen küresel** sayar, birkaç kullanıcı herkesi kilitleyebilir.
- **`2`**: Cloudflare edge IP'si — o da paylaşımlıdır, aynı sınıf hata.
- **`true`**: saldırganın uydurduğu `X-Forwarded-For` girdisi seçilir, limit tek
  bir başlıkla tamamen atlanır.

**Doğrulama:** `GET /api/v1/health` → `proxy.looksMisconfigured` **false** olmalı.
`true` ise `proxy.rawForwardedFor` zincirine bakıp hop sayısını yeniden hesaplayın.

Ayrıntı ve ölçüm kayıtları: `ARCHITECTURE_DECISIONS.md` §6.2.2.

## 4. Client'ın backend adresi

`client/src/utils/constants.js` artık sabit kodlu değildir; `client/.env` içindeki
`EXPO_PUBLIC_ORCHESTRATOR_BASE_URL` ile ezilir (örnek: `client/.env.example`).

> **DİKKAT:** `EXPO_PUBLIC_*` değişkenleri **derleme anında** pakete gömülür.
> Değeri değiştirdikten sonra Expo dev sunucusunu yeniden başlatmak veya web
> build'i yeniden almak GEREKİR — aksi halde eski adres pakette kalır.

## 5. Deploy sonrası doğrulama

```bash
# 1. Liveness — her zaman 200 dönmeli
curl https://<servis-adi>.onrender.com/api/v1/health

# 2. Readiness — mongodb: connected ve sseListener.started: true ise 200
curl -i https://<servis-adi>.onrender.com/api/v1/health/ready
```

Kontrol listesi:

- [ ] `dependencies.mongodb` → `connected` (değilse Atlas whitelist/şifre)
- [ ] `dependencies.stellar.sseListener.started` → `true`
- [ ] `trustProxyHops` → `1`
- [ ] **İki farklı ağdan** (ör. mobil veri + wifi) istek atıldığında `RateLimit-*`
      başlıkları **ayrı ayrı** sayıyor. Aynı sayaçta ilerliyorlarsa
      `TRUST_PROXY_HOPS` yanlıştır.
- [ ] İlk yeniden dağıtımda loglarda `[Server] SIGTERM alındı, kapatılıyor...`
      satırı görünüyor (düzgün kapanma; Windows'ta test edilemez, Linux'ta doğrulanır).

## 6. ⚠️ Ücretsiz plan ve SSE dinleyicisi

`plan: free` iken Render servisi **15 dakika trafik almazsa uyutur** (~50sn soğuk
başlatma). Bu KALEM'de yalnızca yavaşlık değil, işlevsel kayıptır:

- **SSE dinleyicisi ölür** → ödeme zincire yazılır ama onay yakalanmaz →
  **GİB belgesi hiç üretilmez**. §6.4 gereği kalıcı cursor olmadığı için uyku
  sırasında kaçan onay **KALICI olarak kaybolur**.
- Havuz 4→2 besleme cron'u durur.

Sunumda bu, "ödeme gitti ama fiş gelmedi" şeklinde görünür ve kod hatası sanılır.

Seçenekler:

| Seçenek | Maliyet | Yorum |
| :--- | :--- | :--- |
| `plan: starter` | ~$7/ay | Uyumaz. **Sunum için önerilen** — `render.yaml`'da tek satır |
| Uyanık tutma | 0 | Harici cron ile 10 dk'da bir `/api/v1/health`'e ping. İşe yarar ama kırılgan |

`/api/v1/health` ucu bu ping için tasarlanmıştır: her zaman 200 döner ve **dış ağa
hiç çağrı yapmaz**, bu yüzden sık çağrılması güvenlidir. Uyanma sonrası SSE'nin
gerçekten diri olup olmadığı `sseListener.started` ve `stale` alanlarından görülür.

---

> **NOT:** Detaylı kontrat deploy scriptleri Faz 2 Aşama 2.3'te oluşturulacaktır.
