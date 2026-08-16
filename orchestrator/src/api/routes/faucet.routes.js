/**
 * Demo Musluk (Faucet) Route'u — YALNIZCA testnet/demo.
 *
 * POST /api/v1/faucet/mint — çağıranın SAHİP OLDUĞU bir adrese sabit
 * miktarda demo dTL mint eder. Kimlik doğrulaması, esnaf kaydındaki
 * `buildMerchantOwnershipChallenge` deseninin AYNISI: çağıran, adresin
 * ÖZEL anahtarıyla bir mesaj imzalayarak sahipliğini kanıtlar — Bearer
 * API key gerekmez (müşterinin böyle bir anahtarı yok, yalnızca kendi
 * cüzdan anahtarı var).
 *
 * GÜVENLİK: Bu uç yalnızca `STELLAR_NETWORK=testnet` iken çalışır — bkz.
 * docs/ARCHITECTURE_DECISIONS.md §6.7. Mainnet'te bu route'un KENDİSİ
 * kaldırılmalıdır, yalnızca env kontrolüyle yetinilmemelidir; buradaki
 * çalışma zamanı kontrolü ek bir güvenlik ağıdır.
 */

import { Router } from 'express';
import * as StellarSdk from '@stellar/stellar-sdk';
import config from '../../config/index.js';
import { buildFaucetMintChallenge } from '../../utils/crypto.js';
import { mintDemoDtl } from '../../services/faucet.service.js';
import logger from '../../utils/logger.js';

const router = Router();

const CHALLENGE_MAX_AGE_MS = 5 * 60 * 1000; // 5 dakika

/**
 * POST /mint
 *
 * Request Body:
 * {
 *   "address": "G...",           // mint alacak müşteri adresi
 *   "timestamp": 1755289000000,  // epoch ms — imzalanan mesajın parçası
 *   "signature": "<base64>"      // address'in özel anahtarıyla imzalanmış KALEM-FAUCET-MINT:{address}:{timestamp}
 * }
 */
export async function mintFaucetHandler(req, res) {
  try {
    if (config.stellar.network !== 'testnet') {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Demo musluk yalnızca testnet ortamında etkindir.',
      });
    }

    const { address, timestamp, signature } = req.body || {};

    if (!address || typeof address !== 'string' || !StellarSdk.StrKey.isValidEd25519PublicKey(address)) {
      return res
        .status(400)
        .json({ error: 'VALIDATION_ERROR', message: 'address geçerli bir Stellar adresi (G...) olmalıdır.' });
    }
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
      return res
        .status(400)
        .json({ error: 'VALIDATION_ERROR', message: 'timestamp (epoch ms, number) zorunludur.' });
    }
    if (Math.abs(Date.now() - timestamp) > CHALLENGE_MAX_AGE_MS) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'timestamp çok eski veya gelecekte — lütfen tekrar deneyin.',
      });
    }
    if (!signature || typeof signature !== 'string' || !signature.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'signature zorunludur (base64).' });
    }

    const challenge = buildFaucetMintChallenge(address, timestamp);
    let verified = false;
    try {
      const keypair = StellarSdk.Keypair.fromPublicKey(address);
      verified = keypair.verify(Buffer.from(challenge, 'utf8'), Buffer.from(signature, 'base64'));
    } catch {
      verified = false;
    }
    if (!verified) {
      return res
        .status(403)
        .json({ error: 'OWNERSHIP_PROOF_FAILED', message: 'signature, address sahipliğini kanıtlamıyor.' });
    }

    const result = await mintDemoDtl(address);
    res.status(201).json({ address, amount: result.amount, txHash: result.txHash, currency: 'dTL' });
  } catch (error) {
    logger.error(`[Faucet] mintFaucetHandler hatası: ${error.message}`);
    res.status(502).json({ error: 'MINT_FAILED', message: 'Demo dTL mint edilemedi.' });
  }
}

router.post('/mint', mintFaucetHandler);

export default router;
