import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import StatusStep from '../components/StatusStep.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { signData, bytesToBase64 } from '../services/wallet.service.js';
import { accountExists, fundViaFriendbot, readDtlBalance } from '../services/stellar-read.service.js';
import { requestFaucetMint, ApiError } from '../services/api.service.js';
import { buildFaucetMintChallenge } from '../utils/faucetChallenge.js';
import { formatTl, shortenMiddle, stellarExpertTxUrl } from '../utils/format.js';

/**
 * "Bakiye Yükle" — demo/testnet akışı. İki adımı birleştirir:
 * 1. Hesap Horizon'da yoksa Friendbot ile fonla (yalnızca testnet).
 * 2. Sabit miktarda demo dTL mint ettir (backend'deki demo musluk).
 * Gerçek hayatta bu ekranın karşılığı, lisanslı bir ödeme kuruluşunun
 * tahsilat sonrası müşteri hesabına bakiye eklemesidir — bkz.
 * docs/ARCHITECTURE_DECISIONS.md §6.7.
 */
export default function CustomerTopUpScreen({ params }) {
  const { stellarAddress } = params;

  const [steps, setSteps] = useState({ fund: 'pending', mint: 'pending' });
  const [stage, setStage] = useState('idle'); // idle | running | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { amount, txHash, newBalance }

  const handleTopUp = useCallback(async () => {
    setStage('running');
    setError(null);
    setSteps({ fund: 'active', mint: 'pending' });

    try {
      const alreadyFunded = await accountExists(stellarAddress);
      if (!alreadyFunded) {
        await fundViaFriendbot(stellarAddress);
      }
      setSteps((s) => ({ ...s, fund: 'done', mint: 'active' }));

      const timestamp = Date.now();
      const challenge = buildFaucetMintChallenge(stellarAddress, timestamp);
      const signature = await signData(Buffer.from(challenge, 'utf8'));

      const mintResult = await requestFaucetMint({
        address: stellarAddress,
        timestamp,
        signature: bytesToBase64(signature),
      });
      setSteps((s) => ({ ...s, mint: 'done' }));

      let newBalance = null;
      try {
        newBalance = await readDtlBalance(stellarAddress);
      } catch {
        // Bakiye tazelenemedi — sorun değil, sonuç ekranı yine de mint'i gösterir.
      }

      setResult({ amount: mintResult.amount, txHash: mintResult.txHash, newBalance });
      setStage('done');
    } catch (err) {
      setSteps((s) => ({
        fund: s.fund === 'active' ? 'error' : s.fund,
        mint: s.mint === 'active' ? 'error' : s.mint,
      }));
      setError(describeError(err));
      setStage('error');
    }
  }, [stellarAddress]);

  return (
    <Screen>
      <View style={styles.header}>
        <BackButton />
        <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.sm }]}>Bakiye Yükle</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
          Demo — testnet hesabınızı fonlar ve TL bakiyesi yükler
        </Text>
      </View>

      <View style={styles.centerFill}>
        {stage === 'idle' && (
          <View style={styles.card}>
            <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Testnet hesabınız gerekirse fonlanacak, ardından hesabınıza sabit bir demo TL tutarı
              yüklenecektir.
            </Text>
            <Button label="Bakiye Yükle" onPress={handleTopUp} style={{ marginTop: spacing.lg }} />
          </View>
        )}

        {(stage === 'running' || stage === 'error') && (
          <View style={styles.card}>
            <StatusStep label="Testnet hesabı fonlanıyor (gerekirse)" state={steps.fund} />
            <StatusStep label="Demo TL bakiyesi yükleniyor" state={steps.mint} />
            {stage === 'error' && (
              <>
                <Text style={[type.captionMedium, { color: colors.danger, marginTop: spacing.md }]}>
                  {error}
                </Text>
                <Button label="Tekrar Dene" onPress={handleTopUp} style={{ marginTop: spacing.md }} />
              </>
            )}
          </View>
        )}

        {stage === 'done' && result && (
          <View style={styles.card}>
            <View style={styles.successBadge}>
              <Text style={{ fontSize: 28 }}>✓</Text>
            </View>
            <Text style={[type.h2, { color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' }]}>
              Bakiye Yüklendi
            </Text>
            <Text style={styles.amount}>{formatTl(result.amount)}</Text>
            {result.newBalance != null && (
              <Text style={[type.caption, { color: colors.textMuted, marginTop: 4 }]}>
                Güncel bakiye: {formatTl(result.newBalance)}
              </Text>
            )}
            <Text
              style={[type.captionMedium, { color: colors.accent, marginTop: spacing.sm }]}
              onPress={() => Linking.openURL(stellarExpertTxUrl(result.txHash))}
            >
              {shortenMiddle(result.txHash, 8, 8)} ↗
            </Text>
            <Button label="Bir Kez Daha Yükle" variant="secondary" onPress={handleTopUp} style={{ marginTop: spacing.lg }} />
          </View>
        )}
      </View>
    </Screen>
  );
}

function describeError(err) {
  if (err instanceof ApiError) {
    if (err.code === 'FORBIDDEN') return 'Demo musluk yalnızca testnet ortamında etkin.';
    return err.message ?? 'Bakiye yüklenirken bir hata oluştu.';
  }
  return err?.message ?? 'Beklenmeyen bir hata oluştu.';
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    ...cardShadow,
  },
  amount: { fontFamily: 'Inter_800ExtraBold', fontSize: 32, color: colors.accent, marginTop: 4 },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
