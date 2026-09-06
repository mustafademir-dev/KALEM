# KALEM — Kriptografik Ağlarda Lokasyonsuz Eşler arası Mütabakat

> Stellar/Soroban tabanlı, atomik çok taraflı dağılımlı hibrit ödeme ve mutabakat altyapısı.

## Monorepo Yapısı

```
kalem/
├── contracts/       # Soroban akıllı sözleşmeleri (Rust)
│   ├── dtl-token/   # dTL Soroban Custom Token kontratı
│   ├── pool-manager/ # Atomik çok taraflı dağılım kontratı
│   └── shared/      # Kontratlar arası ortak tipler ve sabitler
│
├── orchestrator/    # Node.js orkestrasyon katmanı (Express.js + MongoDB)
├── client/          # React Native (Expo) SoftPOS uygulaması
└── docs/            # Proje dokümantasyonu
```

## Neler Gerçek, Neler Simülasyon

Sistemin ödeme çekirdeği gerçek Stellar testnet üzerinde çalışır ve canlı zincirden doğrulanabilir; dış dünyayla temas eden noktalar (PSP tahsilatı, GİB, KYC) bilinçli olarak simüledir. Ayrıntılı ve kanıtlı ayrım: [`docs/GERCEK_VS_SIMULASYON.md`](docs/GERCEK_VS_SIMULASYON.md)

## Katmanlı Mimari

| Katman | Teknoloji | Görev |
|---|---|---|
| **İstemci** | React Native (Expo) | SoftPOS arayüzü, Ed25519 imzalama, gözetimsiz cüzdan |
| **Orkestrasyon** | Node.js + MongoDB | Fee-Bump sarmalama, SSE dinleme, Idempotency, GİB simülasyonu |
| **Dağıtık Defter** | Stellar (Soroban) | Atomik dağılım, dTL token sözleşmesi, havuz izolasyonu |

## Geliştirme Ortamı

### Ön Koşullar

- **Rust** (1.77+) + `soroban-cli`
- **Node.js** (20 LTS+) + npm
- **MongoDB** (7.0+)
- **Stellar CLI** / Soroban CLI

### Kurulum

```bash
# Kontratları derle (wasm32v1-none hedefini otomatik kullanır)
cd contracts
stellar contract build

# Kontrat birim testlerini çalıştır
cargo test

# Orkestrasyon sunucusunu başlat
cd ../orchestrator
npm install
cp .env.example .env
npm run dev
```

## Lisans

Bu proje TEKNOFEST 2026 yarışması kapsamında geliştirilmektedir.
