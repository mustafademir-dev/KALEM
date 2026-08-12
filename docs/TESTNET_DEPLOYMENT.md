# KALEM — Stellar Testnet Deployment Dokümantasyonu (TESTNET_DEPLOYMENT.md)

> **Tarih:** 10 Ağustos 2026  
> **Ağ:** Stellar Testnet (`Test SDF Network ; September 2015`)  
> **RPC Endpoint:** `https://soroban-testnet.stellar.org`  
> **Stellar CLI Versiyon:** 27.1.0  

---

## 1. Hesaplar ve Adresler (Identities)

Tüm hesaplar `stellar keys generate` komutu ile oluşturulmuş ve Friendbot (`stellar keys fund`) vasıtasıyla test XLM bakiyesi ile aktifleştirilmiştir.

| Hesap / Havuz Adı | Alias | Adres (Public Key) | Adres Tipi (`PoolAddressType`) |
| :--- | :--- | :--- | :--- |
| **Deployer / Admin** | `deployer` | `GAAAUEICPJWHDM23K3RG7HPUFKGZGWXQIPQ5ER76DLD4OJ5UNLX6T6K4` | - |
| **Havuz 1 (Likidite Hazinesi)** | `pool1` | `GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM` | `SorobanAddress` |
| **Havuz 2 (Gaz Sponsor Havuzu)** | `pool2` | `GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK` | `StellarAccount` (Ed25519) |
| **Havuz 3 (Sosyal Destek Fonu)** | `pool3` | `GDIRKWQXXJDNHLVZHTO7USR3FBSTOW7LXEJY7LSML75LSEWJA7EMXJOQ` | `SorobanAddress` |
| **Havuz 4 (Operasyonel Gelir)** | `pool4` | `GBOOXSBUSUUEWK57OBKQU7WUA7V36DZATXY54ACH2V56537QBHSMV3CQ` | `SorobanAddress` |

---

## 2. Deploy Edilen Kontratlar

### A. `dtl-token` (Soroban Custom Token)
- **Contract ID:** `CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4`
- **WASM Hash:** `c1ad6c61e0047da8967265b45a4527fdbd5782451b072e6aa45f6507e0e82cc6`
- **Upload Transaction:** [`a7c45bcec851075acb91396b72c06b66638f396f82affb5c4a49aa227214742b`](https://stellar.expert/explorer/testnet/tx/a7c45bcec851075acb91396b72c06b66638f396f82affb5c4a49aa227214742b)
- **Deploy Transaction:** [`21ca6fbec5979bef215144adf564508cfe63443c61880805aab48b519a5dcdef`](https://stellar.expert/explorer/testnet/tx/21ca6fbec5979bef215144adf564508cfe63443c61880805aab48b519a5dcdef)
- **Initialize Transaction:** [`307140120551786255189bb00760a75547283908fa954ddb43c9c000ee578c2a`](https://stellar.expert/explorer/testnet/tx/307140120551786255189bb00760a75547283908fa954ddb43c9c000ee578c2a)
- **Stellar Expert Link:** [CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4](https://stellar.expert/explorer/testnet/contract/CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4)

#### Initialized Metadata & State:
- **Name:** `"Dijital Türk Lirası Test"`
- **Symbol:** `"dTL"`
- **Decimals:** `7`
- **Admin:** `GAAAUEICPJWHDM23K3RG7HPUFKGZGWXQIPQ5ER76DLD4OJ5UNLX6T6K4`

---

### B. `pool-manager` (Atomik Çok Taraflı Dağılım Kontratı)
- **Contract ID:** `CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF`
- **WASM Hash:** `115f8a4d46a2cbd4e6048dcd4a1f366e19d7add74fecaac88220099ea0762bb8`
- **Upload Transaction:** [`786342d31e33c517246e1f2bd2d75929f2dc72139df822a306ed5123f7922d8d`](https://stellar.expert/explorer/testnet/tx/786342d31e33c517246e1f2bd2d75929f2dc72139df822a306ed5123f7922d8d)
- **Deploy Transaction:** [`090334f7e07e146f6e12d7cabce95b50a79cff74b28f014c937d2242ce9cffeb`](https://stellar.expert/explorer/testnet/tx/090334f7e07e146f6e12d7cabce95b50a79cff74b28f014c937d2242ce9cffeb)
- **Initialize Transaction:** [`14ce8dbe8e304ef436a56c7920a0f83f150af8dafaa9037ff738ce4f2d59ea88`](https://stellar.expert/explorer/testnet/tx/14ce8dbe8e304ef436a56c7920a0f83f150af8dafaa9037ff738ce4f2d59ea88)
- **Stellar Expert Link:** [CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF](https://stellar.expert/explorer/testnet/contract/CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF)

#### Initialized Config (`get_config` Doğrulandı):
- `dtl_token_address`: `CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4`
- `pool1_address`: `GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM`
- `pool3_address`: `GDIRKWQXXJDNHLVZHTO7USR3FBSTOW7LXEJY7LSML75LSEWJA7EMXJOQ`
- `pool4_address`: `GBOOXSBUSUUEWK57OBKQU7WUA7V36DZATXY54ACH2V56537QBHSMV3CQ`

---

## 3. Çalıştırılan Tam Deployment ve Initialize Komutları

```bash
# 1. Anahtar ve Hesap Oluşturma
stellar keys generate deployer
stellar keys fund deployer --network testnet

stellar keys generate pool1 --network testnet --fund
stellar keys generate pool2 --network testnet --fund
stellar keys generate pool3 --network testnet --fund
stellar keys generate pool4 --network testnet --fund

# 2. dtl-token Deploy & Initialize
stellar contract upload --wasm target/wasm32v1-none/release/kalem_dtl_token.wasm --source-account deployer --network testnet --no-cache
# Output WASM Hash: c1ad6c61e0047da8967265b45a4527fdbd5782451b072e6aa45f6507e0e82cc6

stellar contract deploy --wasm-hash c1ad6c61e0047da8967265b45a4527fdbd5782451b072e6aa45f6507e0e82cc6 --source-account deployer --network testnet --alias dtl-token
# Output Contract ID: CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4

stellar contract invoke --id CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4 --source-account deployer --network testnet -- initialize --admin deployer --name 'Dijital Türk Lirası Test' --symbol 'dTL' --decimal 7 --pools-file-path pools.json

# 3. pool-manager Deploy & Initialize
stellar contract upload --wasm target/wasm32v1-none/release/kalem_pool_manager.wasm --source-account deployer --network testnet --no-cache
# Output WASM Hash: 115f8a4d46a2cbd4e6048dcd4a1f366e19d7add74fecaac88220099ea0762bb8

stellar contract deploy --wasm-hash 115f8a4d46a2cbd4e6048dcd4a1f366e19d7add74fecaac88220099ea0762bb8 --source-account deployer --network testnet --alias pool-manager
# Output Contract ID: CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF

stellar contract invoke --id CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF --source-account deployer --network testnet -- initialize --admin deployer --config-file-path pm_config.json
```

---

## 4. Manuel E2E Test Sonuçları (Dağılım Doğrulaması)

1. **dTL İhraç (Mint):**
   - **Komut:** `stellar contract invoke --id CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4 --source-account deployer --network testnet --send=yes -- mint --to deployer --amount 1000000000`
   - **İşlem Hash:** [`c133f5f007bd71971635c09ad7d1928ba3f570804b49fdc8095f644d35f8804d`](https://stellar.expert/explorer/testnet/tx/c133f5f007bd71971635c09ad7d1928ba3f570804b49fdc8095f644d35f8804d)
   - **Tutar:** 1.000.000.000 stroops (100.0000000 dTL) `deployer` hesabına basıldı.

2. **Atomik Dağıtım (`distribute`):**
   - **Komut:** `stellar contract invoke --id CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF --source-account deployer --network testnet --send=yes -- distribute --from deployer --total_amount 1000000000`
   - **İşlem Hash:** [`a3ca5ad1814a16e24980b6afa92791d01b086a978856c0870565a3964607136c`](https://stellar.expert/explorer/testnet/tx/a3ca5ad1814a16e24980b6afa92791d01b086a978856c0870565a3964607136c)

3. **On-Chain Bakiye ve Oran Doğrulaması:**

| Hesap | Beklenen Oran | Beklenen Tutar (stroops) | Gerçekleşen Bakiye (On-Chain) | Durum |
| :--- | :--- | :--- | :--- | :--- |
| **Havuz 1 (Likidite)** | %99.6 (996/1000) | 996.000.000 | `996000000` | ✅ Doğrulandı |
| **Havuz 2 (Gaz Sponsor)** | %0.0 (XLM Hesabı) | 0 | `0` | ✅ Doğrulandı |
| **Havuz 3 (Sosyal Destek)** | %0.1 (1/1000) | 1.000.000 | `1000000` | ✅ Doğrulandı |
| **Havuz 4 (Operasyonel)** | %0.3 (3/1000) | 3.000.000 | `3000000` | ✅ Doğrulandı |
| **Gönderen (`deployer`)** | Kalan | 0 | `0` | ✅ Doğrulandı |

---

## 5. Orkestrasyon Katmanı (Orchestrator) İçin Çevre Değişkenleri

```env
STELLAR_NETWORK=testnet
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

DTL_TOKEN_CONTRACT_ID=CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4
POOL_MANAGER_CONTRACT_ID=CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF

ADMIN_PUBLIC_KEY=GAAAUEICPJWHDM23K3RG7HPUFKGZGWXQIPQ5ER76DLD4OJ5UNLX6T6K4
POOL1_PUBLIC_KEY=GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM
POOL2_PUBLIC_KEY=GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK
POOL3_PUBLIC_KEY=GDIRKWQXXJDNHLVZHTO7USR3FBSTOW7LXEJY7LSML75LSEWJA7EMXJOQ
POOL4_PUBLIC_KEY=GBOOXSBUSUUEWK57OBKQU7WUA7V36DZATXY54ACH2V56537QBHSMV3CQ
```
