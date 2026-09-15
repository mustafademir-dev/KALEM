/**
 * Kontrat Olayı Okuyucu Testleri
 *
 * Sahte olay üretilmez: `fixtures/pay-merchant-b5466573.json`, gerçek testnet
 * ödemesi `b5466573…` için Soroban RPC `getTransaction` cevabının ham XDR'ıdır
 * (15 Eylül 2026'da alındı). Testler, üretimdeki çözücünün o gerçek byte'ları
 * doğru okuduğunu kanıtlar — `pay_merchant` başlığının ScString kodlanması
 * tuzağı dahil.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as StellarSdk from '@stellar/stellar-sdk';

import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import {
  decodeContractEvents,
  extractPayMerchantDistribution,
  readPaymentOutcome,
} from '../src/services/contract-events.service.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/pay-merchant-b5466573.json', import.meta.url), 'utf8'));

const MERCHANT = 'GBVGMDK2OBOUQGKN4WELVRTYTJK6S2C5RY6WHGDX3WISX5WOAHR5CXXI';
const CUSTOMER = 'GDKRUILGDWQ2L3HRZGHKJN565E6KLHV3XBDGZFUZI22MRZSWIWTCRH6B';
const POOL2 = 'GAXVXYZ7DTFCK5JKXPAWSMJ3V72KCZGO5LIR32AHD73HLQOVGJMQURVK';
const POOL3 = 'GDIRKWQXXJDNHLVZHTO7USR3FBSTOW7LXEJY7LSML75LSEWJA7EMXJOQ';
const POOL4 = 'GBOOXSBUSUUEWK57OBKQU7WUA7V36DZATXY54ACH2V56537QBHSMV3CQ';

/** Fixture'dan SDK'nın `rpc.Server.getTransaction` ile döndürdüğü ŞEKİLDE cevap kurar. */
function buildRpcResponseFromFixture() {
  return {
    status: fixture.status,
    txHash: fixture.txHash,
    ledger: fixture.ledger,
    createdAt: fixture.createdAt,
    envelopeXdr: StellarSdk.xdr.TransactionEnvelope.fromXDR(fixture.envelopeXdr, 'base64'),
    resultXdr: StellarSdk.xdr.TransactionResult.fromXDR(fixture.resultXdr, 'base64'),
    events: {
      contractEventsXdr: fixture.contractEventsXdr.map((op) =>
        op.map((e) => StellarSdk.xdr.ContractEvent.fromXDR(e, 'base64'))
      ),
      transactionEventsXdr: [],
    },
  };
}

describe('Kontrat Olayı Okuyucu — gerçek pay_merchant işlemi', () => {
  const originalSoroban = stellarConfig.sorobanServer;
  const originalContracts = { ...config.contracts };
  const originalPool1 = config.pools.pool1Address;

  before(() => {
    config.contracts.poolManagerId = fixture.contracts.poolManagerId;
    config.contracts.dtlTokenId = fixture.contracts.dtlTokenId;
  });

  after(() => {
    stellarConfig.sorobanServer = originalSoroban;
    Object.assign(config.contracts, originalContracts);
    config.pools.pool1Address = originalPool1;
  });

  it('decodeContractEvents: 3 transfer + 1 pay_merchant olayını ScString başlıklarıyla çözmeli', () => {
    const events = decodeContractEvents(buildRpcResponseFromFixture().events.contractEventsXdr);

    assert.equal(events.length, 4);
    const transfers = events.filter((e) => e.topics[0].value === 'transfer');
    assert.equal(transfers.length, 3);
    const pay = events.find((e) => e.topics[0].value === 'pay_merchant');
    assert.ok(pay, 'pay_merchant olayı bulunmalı');
    assert.equal(pay.topics[0].type, 'scvString', 'başlık ScSymbol DEĞİL ScString olmalı (gerçek zincir kodlaması)');
    assert.equal(pay.contractId, fixture.contracts.poolManagerId);
    assert.deepEqual(pay.data, ['25000000', '24900000', '25000', '75000']);
  });

  it('extractPayMerchantDistribution: Havuz 1 (Esnaf Kasası) / Havuz 3 / Havuz 4 dallarını zincirdeki adres ve tutarlarla üretmeli', () => {
    const events = decodeContractEvents(buildRpcResponseFromFixture().events.contractEventsXdr);
    const d = extractPayMerchantDistribution(events, fixture.contracts);

    assert.equal(d.from, CUSTOMER);
    assert.equal(d.total, '25000000');
    assert.deepEqual(
      d.branches.map((b) => [b.pool, b.label, b.address, b.amount]),
      [
        [1, 'Havuz 1 (Esnaf Kasası)', MERCHANT, '24900000'],
        [3, 'Havuz 3 (Sosyal Fon)', POOL3, '25000'],
        [4, 'Havuz 4 (Operasyonel)', POOL4, '75000'],
      ]
    );
    assert.equal(d.sumMatchesTotal, true);
    assert.equal(d.transfersMatch, true);
  });

  it('Havuz 1 adresi config.pools.pool1Address\'ten DEĞİL, zincirdeki esnaf adresinden gelmeli', () => {
    // v1'den kalma POOL1_ADDRESS pay_merchant akışında hiç yer almaz.
    config.pools.pool1Address = 'GDWNZKIREKS2WLZGBGWBBO3JZUEXIXNG4USX5F4AIM2UBD5W4CLXDKEM';
    const events = decodeContractEvents(buildRpcResponseFromFixture().events.contractEventsXdr);
    const d = extractPayMerchantDistribution(events, fixture.contracts);

    assert.equal(d.branches[0].address, MERCHANT);
    assert.ok(d.branches.every((b) => b.address !== config.pools.pool1Address));
  });

  it('başka bir kontratın olaylarını pay_merchant sanmamalı', () => {
    const events = decodeContractEvents(buildRpcResponseFromFixture().events.contractEventsXdr);
    const d = extractPayMerchantDistribution(events, {
      poolManagerId: 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4',
      dtlTokenId: fixture.contracts.dtlTokenId,
    });
    assert.equal(d, null);
  });

  it('readPaymentOutcome: ücret sponsoru Havuz 2, ücret tavanı ve ödenen ücret zarftan okunmalı', async () => {
    stellarConfig.sorobanServer = { getTransaction: async () => buildRpcResponseFromFixture() };

    const outcome = await readPaymentOutcome(fixture.txHash);

    assert.equal(outcome.found, true);
    assert.equal(outcome.contract.successful, true);
    assert.equal(outcome.contract.ledger, 4628674);
    assert.equal(outcome.contract.ledgerClosedAt, '2026-09-11T22:49:17.000Z');
    assert.equal(outcome.contract.feeSource, POOL2);
    assert.equal(outcome.contract.maxFee, '8026091');
    assert.equal(outcome.contract.feeCharged, '6976855');
    assert.equal(outcome.distribution.branches[0].amount, '24900000');
  });

  it('readPaymentOutcome: RPC NOT_FOUND süre dolunca found:false dönmeli (saklama penceresi dışı)', async () => {
    let calls = 0;
    stellarConfig.sorobanServer = {
      getTransaction: async () => {
        calls += 1;
        return { status: 'NOT_FOUND', oldestLedger: 4570450, latestLedger: 4691409 };
      },
    };

    const outcome = await readPaymentOutcome('0'.repeat(64), { timeoutMs: 30, intervalMs: 10 });

    assert.equal(outcome.found, false);
    assert.equal(outcome.reason, 'RPC_NOT_FOUND');
    assert.ok(calls >= 2, 'NOT_FOUND iken yeniden denemeli');
  });

  it('readPaymentOutcome: önce NOT_FOUND sonra SUCCESS gelirse beklemeli ve sonucu okumalı', async () => {
    let calls = 0;
    stellarConfig.sorobanServer = {
      getTransaction: async () => {
        calls += 1;
        return calls < 3 ? { status: 'NOT_FOUND' } : buildRpcResponseFromFixture();
      },
    };

    const outcome = await readPaymentOutcome(fixture.txHash, { timeoutMs: 1000, intervalMs: 5 });

    assert.equal(outcome.found, true);
    assert.equal(calls, 3);
  });
});
