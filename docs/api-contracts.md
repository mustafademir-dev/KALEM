# KALEM — Modüller Arası API Sözleşmeleri

## 1. İstemci → Orkestrasyon (REST API)

### POST `/api/v1/transactions/submit`

**Headers:**
| Header | Zorunlu | Açıklama |
|---|---|---|
| `Content-Type` | ✅ | `application/json` |
| `Idempotency-Key` | ✅ | UUID v4 formatında benzersiz anahtar |

**Request Body:**
```json
{
  "signedXdr": "AAAA...",
  "merchantId": "ObjectId string",
  "totalAmount": "10000000",
  "cartItems": [
    { "name": "Ürün A", "quantity": 1, "price": "5000000", "vatRate": 20 }
  ]
}
```

**Response (201 Created):**
```json
{
  "transactionId": "ObjectId string",
  "status": "submitted",
  "message": "İşlem Fee-Bump ile sarmalanarak Stellar ağına iletildi."
}
```

---

### GET `/api/v1/merchants/:id/balance`

**Response (200):**
```json
{
  "merchantId": "...",
  "stellarAddress": "G...",
  "balance": "95600000",
  "currency": "dTL"
}
```

---

### POST `/api/v1/transactions/:txHash/merchant-ack`

Esnaf ekranı ödemeyi zincirde gördüğünde çağrılır — canlı işlem akışının 9. adımı (bkz. `ARCHITECTURE_DECISIONS.md` §9).

**Headers:** `Authorization: Bearer <apiKey>` (zorunlu — yalnızca kendi işlemi)

**Request Body (opsiyonel):** `{ "detectedLedger": 4628674 }`

**Response (200):** `{ "acknowledged": true, "duplicate": false }` — ikinci çağrıda `duplicate: true`, yeni olay yazılmaz.
**Hatalar:** `401` anahtar yok/geçersiz · `403` başka esnafın işlemi · `404` hash bilinmiyor (istemci kısa aralıkla yeniden dener)

---

### GET `/api/v1/flow/latest?token=<FLOW_PANEL_TOKEN>`

Akış olayı olan en yeni işlemin anlık görüntüsü. `FLOW_PANEL_TOKEN` tanımlı değilse `503 FLOW_PANEL_DISABLED`, token yanlışsa `401`.

**Response (200):**
```json
{
  "flow": {
    "transactionId": "...",
    "txHash": "b5466573…",
    "innerTxHash": "00bbc792…",
    "status": "confirmed",
    "totalAmount": "25000000",
    "senderAddress": "G...",
    "ledgerNumber": 4628674,
    "createdAt": "2026-09-15T14:00:00.000Z",
    "merchant": { "businessName": "…", "stellarAddress": "G..." },
    "steps": ["signed", "received", "fee_bump", "submitted", "contract", "distribution", "caught", "gib", "merchant_seen"],
    "events": [
      { "step": "signed", "status": "done", "at": "…", "data": { "signer": "G...", "innerTxHash": "…" } },
      { "step": "distribution", "status": "done", "at": "…", "data": {
          "total": "25000000",
          "branches": [
            { "pool": 1, "label": "Havuz 1 (Esnaf Kasası)", "address": "G...(esnaf)", "amount": "24900000" },
            { "pool": 3, "label": "Havuz 3 (Sosyal Fon)", "address": "G...", "amount": "25000" },
            { "pool": 4, "label": "Havuz 4 (Operasyonel)", "address": "G...", "amount": "75000" }
          ],
          "sumMatchesTotal": true, "transfersMatch": true
      } }
    ]
  }
}
```
Hiç akış yoksa `{ "flow": null }`.

### GET `/api/v1/flow/stream?token=<FLOW_PANEL_TOKEN>`

`text/event-stream`. Bağlanınca `event: snapshot` (`/latest` ile aynı gövde), ardından her yeni akış olayında `event: flow` (işlemin güncel tam görüntüsü). 20 sn'de bir `: ping` yorum satırı. Eşzamanlı yayın sınırı aşılırsa `429 TOO_MANY_STREAMS`.

---

## 2. Orkestrasyon → Soroban Kontratları (Cross-Contract)

### `dtl-token.transfer(from, to, amount)`
- `to` yalnızca Havuz 1/2/3/4 adreslerinden biri olabilir
- Aksi halde `UnauthorizedRecipient` hatası

### `pool-manager.distribute(from, total_amount)`
- İçeride `dtl-token.transfer()` 3 kez çağrılır (Havuz 1/3/4)
- Atomik: biri fail → hepsi rollback

### `dtl-token.mint(to, amount)` — Yalnızca ihraççı
### `dtl-token.burn(from, amount)` — Yalnızca ihraççı

---

## 3. Orkestrasyon → Stellar Horizon API

### Fee-Bump İletimi
```
TransactionBuilder.buildFeeBumpTransaction(
  feeSource: Pool2 G... adresi,
  baseFee: "100",
  innerTx: istemciden gelen imzalı iç zarf,
  networkPassphrase
)
→ Pool2 secret key ile imzala
→ server.submitTransaction(feeBumpTx)
```

### SSE Dinleme
```
server.transactions()
  .forAccount(pool1Address)
  .cursor('now')
  .stream({ onmessage: handleTransaction })
```
