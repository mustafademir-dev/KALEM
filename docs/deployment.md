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

> **NOT:** Detaylı deploy scriptleri Faz 2 Aşama 2.3'te oluşturulacaktır.
