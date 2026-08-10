# KALEM — Mimari Genel Bakış

> Bu belge, projenin mimari kararlarının ve katmanlı yapısının referans dokümantasyonudur.

## Katmanlı Hibrit Mimari

```
┌──────────────────────────────────────────────────────────────┐
│                    İSTEMCİ KATMANI                           │
│          React Native (Expo) — SoftPOS Uygulaması            │
│   Ed25519 imzalama │ Gözetimsiz cüzdan │ XDR oluşturma      │
└──────────────────────────┬───────────────────────────────────┘
                           │ POST /api/v1/transactions/submit
                           │ (imzalı XDR + Idempotency-Key)
┌──────────────────────────▼───────────────────────────────────┐
│                 ORKESTRASYON KATMANI                          │
│            Node.js (Express.js) + MongoDB                    │
│                                                              │
│  Fee-Bump sarmalama │ SSE dinleme │ Idempotency koruması     │
│  GİB/ÖKC simülasyonu │ Havuz 4→2 besleme (cron)             │
└──────────────────────────┬───────────────────────────────────┘
                           │ Stellar Horizon API + Soroban RPC
┌──────────────────────────▼───────────────────────────────────┐
│              DAĞITIK DEFTER KATMANI                           │
│                Stellar (Soroban)                             │
│                                                              │
│  dtl-token kontratı (Custom Token, P2P bloklu)               │
│  pool-manager kontratı (Atomik 3'lü dağılım)                │
│  Havuz 2: Klasik Stellar hesabı (G... adresi, XLM)          │
└──────────────────────────────────────────────────────────────┘
```

## Havuz Yapısı

| Havuz | Tip | Varlık | Adres Tipi |
|---|---|---|---|
| Havuz 1 — Likidite | Mantıksal bakiye | dTL | SorobanAddress |
| Havuz 2 — Gaz Sponsor | Klasik Stellar hesabı | XLM | StellarAccount (G...) |
| Havuz 3 — Sosyal | Mantıksal bakiye | dTL | SorobanAddress |
| Havuz 4 — Operasyonel | Mantıksal bakiye | dTL | SorobanAddress |

## Temel Tasarım Kararları

1. **dTL = Soroban Custom Token** (Stellar native asset değil)
2. **P2P blokaj = transfer() override** (Trustline değil)
3. **Havuz 2 = Klasik Stellar hesabı** (Fee-Bump fee source zorunluluğu)
4. **Havuz 4→2 besleme = burn + off-chain dönüşüm** (AMM/Path Payment yok)
5. **Fee-Bump = CAP-0015 native mekanizma**
