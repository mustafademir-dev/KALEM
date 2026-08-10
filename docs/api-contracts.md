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
