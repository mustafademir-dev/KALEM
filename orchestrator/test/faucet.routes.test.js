import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as StellarSdk from '@stellar/stellar-sdk';
import config from '../src/config/index.js';
import stellarConfig from '../src/config/stellar.js';
import { buildFaucetMintChallenge } from '../src/utils/crypto.js';
import { mintFaucetHandler } from '../src/api/routes/faucet.routes.js';

function signChallenge(keypair, address, timestamp) {
  const challenge = buildFaucetMintChallenge(address, timestamp);
  return keypair.sign(Buffer.from(challenge, 'utf8')).toString('base64');
}

function createMockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

describe('Faucet Routes Unit Tests', () => {
  describe('mintFaucetHandler', () => {
    it('STELLAR_NETWORK testnet değilse 403 döndürmelidir (mainnet güvenlik ağı)', async () => {
      const originalNetwork = config.stellar.network;
      config.stellar.network = 'pubnet';

      try {
        const req = { body: {} };
        const res = createMockRes();
        await mintFaucetHandler(req, res);
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.error, 'FORBIDDEN');
      } finally {
        config.stellar.network = originalNetwork;
      }
    });

    it('geçersiz address 400 döndürmelidir', async () => {
      const req = { body: { address: 'gecersiz', timestamp: Date.now(), signature: 'x' } };
      const res = createMockRes();
      await mintFaucetHandler(req, res);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.error, 'VALIDATION_ERROR');
    });

    it('timestamp eksikse 400 döndürmelidir', async () => {
      const kp = StellarSdk.Keypair.random();
      const req = { body: { address: kp.publicKey(), signature: 'x' } };
      const res = createMockRes();
      await mintFaucetHandler(req, res);
      assert.equal(res.statusCode, 400);
    });

    it('timestamp 5 dakikadan eskiyse 400 döndürmelidir (replay penceresi)', async () => {
      const kp = StellarSdk.Keypair.random();
      const staleTimestamp = Date.now() - 10 * 60 * 1000;
      const req = {
        body: {
          address: kp.publicKey(),
          timestamp: staleTimestamp,
          signature: signChallenge(kp, kp.publicKey(), staleTimestamp),
        },
      };
      const res = createMockRes();
      await mintFaucetHandler(req, res);
      assert.equal(res.statusCode, 400);
    });

    it('signature başka bir anahtarla imzalanmışsa 403 döndürmelidir', async () => {
      const claimedKp = StellarSdk.Keypair.random();
      const wrongKp = StellarSdk.Keypair.random();
      const timestamp = Date.now();
      const req = {
        body: {
          address: claimedKp.publicKey(),
          timestamp,
          signature: signChallenge(wrongKp, claimedKp.publicKey(), timestamp),
        },
      };
      const res = createMockRes();
      await mintFaucetHandler(req, res);
      assert.equal(res.statusCode, 403);
      assert.equal(res.body.error, 'OWNERSHIP_PROOF_FAILED');
    });

    it('geçerli imza ile mint edip 201 döndürmelidir', async () => {
      const originalHorizon = stellarConfig.horizonServer;
      const originalSoroban = stellarConfig.sorobanServer;
      const originalIssuerSecret = config.secrets.issuerSecretKey;
      const originalDtlId = config.contracts.dtlTokenId;
      const originalMintAmount = config.faucet.mintAmountStroops;

      const issuerKp = StellarSdk.Keypair.random();
      const customerKp = StellarSdk.Keypair.random();
      config.secrets.issuerSecretKey = issuerKp.secret();
      config.contracts.dtlTokenId = 'CC4ME5GZASQP456TPFEEADRK4NOFVV4KWX5TJGHJBO7SGK34IMIPWTX4';
      config.faucet.mintAmountStroops = '100000000';

      stellarConfig.horizonServer = {
        loadAccount: async () => new StellarSdk.Account(issuerKp.publicKey(), '100'),
        submitTransaction: async (tx) => {
          assert.equal(tx.source, issuerKp.publicKey());
          return { hash: 'minthash123' };
        },
      };
      stellarConfig.sorobanServer = {
        prepareTransaction: async (rawTx) => rawTx,
      };

      const timestamp = Date.now();
      const req = {
        body: {
          address: customerKp.publicKey(),
          timestamp,
          signature: signChallenge(customerKp, customerKp.publicKey(), timestamp),
        },
      };
      const res = createMockRes();

      try {
        await mintFaucetHandler(req, res);
        assert.equal(res.statusCode, 201);
        assert.equal(res.body.address, customerKp.publicKey());
        assert.equal(res.body.amount, '100000000');
        assert.equal(res.body.txHash, 'minthash123');
        assert.equal(res.body.currency, 'dTL');
      } finally {
        stellarConfig.horizonServer = originalHorizon;
        stellarConfig.sorobanServer = originalSoroban;
        config.secrets.issuerSecretKey = originalIssuerSecret;
        config.contracts.dtlTokenId = originalDtlId;
        config.faucet.mintAmountStroops = originalMintAmount;
      }
    });
  });
});
