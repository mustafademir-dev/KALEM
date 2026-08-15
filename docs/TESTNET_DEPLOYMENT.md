# KALEM — Stellar Testnet Deployment Dokümantasyonu (TESTNET_DEPLOYMENT.md)

> **Not:** Bu belgede iki ayrı deploy nesli belgelidir — **Mimari v1** (aşağıda, TEK BİR SATIRI DEĞİŞTİRİLMEDEN korunmuştur) ve **Mimari v2** (dosyanın sonunda, Müşteri→Esnaf Ödeme özelliğiyle). v1 kanıtları BİLİNÇLİ OLARAK silinmemiş/üzerine yazılmamıştır — "önce şunu kanıtladık, sonra geliştirdik" tarihçesi bir zayıflık değil, gelişim kaydıdır. Ayrıntılı gerekçe için bkz. `ARCHITECTURE_DECISIONS.md §7`.

---

# Mimari v1 (İlk Deploy — Yalnızca Havuzlar Arası Transfer)

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

---

# Mimari v2 (Müşteri→Esnaf Ödeme — `pay_merchant`)

> **Tarih:** 15 Ağustos 2026
> **Ağ:** Stellar Testnet (`Test SDF Network ; September 2015`)
> **Stellar CLI Versiyon:** 27.1.0 (v1 ile aynı)
> **Gerekçe ve tam tasarım kararı:** `ARCHITECTURE_DECISIONS.md §7`

## v1 → v2 Ne Değişti (Özet)

- `dtl-token`: `register_merchant()`/`is_merchant()` eklendi; `transfer()` artık alıcı olarak kayıtlı 4 havuza EK olarak kayıtlı esnaf adreslerini de kabul ediyor; gönderen kayıtlı bir esnafsa koşulsuz reddediliyor (`MerchantCannotSend`, #8).
- `pool-manager`: `pay_merchant(from, merchant, total_amount)` eklendi — `distribute()` ile aynı atomik desen, hedeflerden biri Havuz 1 yerine esnaf (%99.6 esnaf, %0.1 Havuz 3, %0.3 Havuz 4).
- Havuz 1/2/3/4 adresleri, `POOL2_SECRET_KEY`, `ISSUER_SECRET_KEY` DEĞİŞMEDİ — yalnızca iki kontrat ID'si değişti (upgrade hook olmadığı için redeploy zorunluydu).
- Yeni `pm_config.json`'ın `dtl_token_address` alanı v2 dtl-token ID'sine güncellendi (pool1/3/4 adresleri aynı kaldı).

## Kontrat ve WASM Bilgileri

### A. `dtl-token` v2
- **Contract ID:** `CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO`
- **WASM Hash:** `e919f07caf0013b6210bbde6f87e80aa3bde2b95b8549e9e9b7a1d73861093f1`
- **WASM Boyutu:** 14,325 bytes
- **Dışa Aktarılan Semboller (14):** `allowance`, `approve`, `balance`, `burn`, `decimals`, `initialize`, `is_merchant`, `mint`, `name`, `register_merchant`, `symbol`, `total_supply`, `transfer`, `transfer_from`
- **Upload Transaction:** [`a831544321ac0a8fa8ec2126294217aad123fe6429dfaa6e1e77ccd53890635d`](https://stellar.expert/explorer/testnet/tx/a831544321ac0a8fa8ec2126294217aad123fe6429dfaa6e1e77ccd53890635d)
- **Deploy Transaction:** [`c62d5ba984faff56401c489b59501952c3e9f173a3182767f8fe1ae1a660e3ff`](https://stellar.expert/explorer/testnet/tx/c62d5ba984faff56401c489b59501952c3e9f173a3182767f8fe1ae1a660e3ff)
- **Initialize Transaction:** [`1d8cdde586acf67ae1fbd8864c3814019ab58f61b9e40308212708be41e70c7b`](https://stellar.expert/explorer/testnet/tx/1d8cdde586acf67ae1fbd8864c3814019ab58f61b9e40308212708be41e70c7b)
- **Stellar Expert:** [CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO](https://stellar.expert/explorer/testnet/contract/CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO)
- **Initialize parametreleri:** admin=`deployer`, name="Dijital Türk Lirası Test", symbol="dTL", decimal=7, pools=`pools.json` (v1 ile AYNI dosya, havuz adresleri değişmedi)

### B. `pool-manager` v2
- **Contract ID:** `CDR7WMMQLINNIC2PCSWUU27FHUWWLZPHBJU7MQK5EZVOJBIWQA47LQSA`
- **WASM Hash:** `b9a52dd64fd8af92fa9d0a6455f4b04d09637a9f9a9fa8736db066f4e7610be0`
- **WASM Boyutu:** 11,158 bytes
- **Dışa Aktarılan Semboller (4):** `distribute`, `get_config`, `initialize`, `pay_merchant`
- **Upload Transaction:** [`dd9ccbdbaced16f601fe40bf69e948b07d2d1dc8885e33080cf81489309ef703`](https://stellar.expert/explorer/testnet/tx/dd9ccbdbaced16f601fe40bf69e948b07d2d1dc8885e33080cf81489309ef703)
- **Deploy Transaction:** [`8494802b77d6ce1376261f5fa0ca2f12f6cd9c97667e22bc1d3796d1956af9c4`](https://stellar.expert/explorer/testnet/tx/8494802b77d6ce1376261f5fa0ca2f12f6cd9c97667e22bc1d3796d1956af9c4)
- **Initialize Transaction:** [`c1d6f967f1ffa235ef95162b10d56b9d61d13b25a79f2488b73d49402de884c9`](https://stellar.expert/explorer/testnet/tx/c1d6f967f1ffa235ef95162b10d56b9d61d13b25a79f2488b73d49402de884c9)
- **Stellar Expert:** [CDR7WMMQLINNIC2PCSWUU27FHUWWLZPHBJU7MQK5EZVOJBIWQA47LQSA](https://stellar.expert/explorer/testnet/contract/CDR7WMMQLINNIC2PCSWUU27FHUWWLZPHBJU7MQK5EZVOJBIWQA47LQSA)
- **`get_config` ile doğrulanan konfigürasyon:**
  ```json
  {"dtl_token_address":"CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO","pool1_address":"GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM","pool3_address":"GDIRKWQXXJDNHLVZHTO7USR3FBSTOW7LXEJY7LSML75LSEWJA7EMXJOQ","pool4_address":"GBOOXSBUSUUEWK57OBKQU7WUA7V36DZATXY54ACH2V56537QBHSMV3CQ"}
  ```

## Gerçek E2E Doğrulama Sonuçları (15 Ağustos 2026)

Tam akış, senaryo, negatif kanıt ve bakiye tabloları için bkz. `HANDOFF_TO_CLAUDE_CODE.md` **Bölüm 10**. Özet tx hash'leri:

| Adım | Tx Hash | Stellar Expert |
|---|---|---|
| register_merchant (approve-merchant.mjs) | `f1f835db78582bd45a819a26c1da56cf4cbe65c90e5fc225a0f3e7bbf44d6d6f` | [Link](https://stellar.expert/explorer/testnet/tx/f1f835db78582bd45a819a26c1da56cf4cbe65c90e5fc225a0f3e7bbf44d6d6f) |
| mint (müşteriye 1 dTL) | `f04aab520abb4a34dd94a762b8f87f505b3d6e56d01067cc2492e8b16951cc94` | [Link](https://stellar.expert/explorer/testnet/tx/f04aab520abb4a34dd94a762b8f87f505b3d6e56d01067cc2492e8b16951cc94) |
| pay_merchant (gerçek fee-bump, `/transactions/submit`) | `ba2c5df490ceec1dfa7d82253e83887c676c8b2c8523f98978206f6e7b041061` | [Link](https://stellar.expert/explorer/testnet/tx/ba2c5df490ceec1dfa7d82253e83887c676c8b2c8523f98978206f6e7b041061) |
| negatif kanıt (esnaf gönderemez) | **tx hash YOK** (simülasyon aşamasında reddedildi — bkz. Bölüm 10) | — |

## Orkestrasyon `.env` Güncellemesi

```env
# v1 (eski, korunan kanıt): CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4 / CBFJOXNUATWPCSONJMQUOFL3QML2VHZCT5A5SOOJ3BSN5BSFAGPOR4WF
DTL_TOKEN_CONTRACT_ID=CC6TSYYOENEATJRP5NXJPR35TVRPMK47JAPZZZ5JGUKM4J6EVGWWDARO
POOL_MANAGER_CONTRACT_ID=CDR7WMMQLINNIC2PCSWUU27FHUWWLZPHBJU7MQK5EZVOJBIWQA47LQSA
```

Havuz adresleri ve gizli anahtarlar (`POOL2_SECRET_KEY`, `ISSUER_SECRET_KEY`) v1 ile AYNI kaldı, değiştirilmedi.
