import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import GibReceiptCard from '../components/GibReceiptCard.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { getCurrentLedger, findNewPayment } from '../services/merchant-chain.service.js';
import { getGibDocument, ApiError } from '../services/api.service.js';
import { formatDtl, shortenMiddle, stellarExpertTxUrl } from '../utils/format.js';

const POLL_INTERVAL_MS = 3000;

export default function EsnafQrScreen({ params }) {
  const { payload, totalAmount, stellarAddress, session } = params;
  const { navigate, reset } = useNavigation();

  const [payment, setPayment] = useState(null); // { from, amount, txHash }
  const [gibState, setGibState] = useState({ status: 'idle', document: null, error: null });
  const sinceLedgerRef = useRef(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    (async () => {
      try {
        sinceLedgerRef.current = (await getCurrentLedger()) - 1; // -1: aynı ledger'da gelen ödemeyi de kaçırma
      } catch {
        sinceLedgerRef.current = null;
      }
      poll();
    })();

    async function poll() {
      if (stoppedRef.current || sinceLedgerRef.current == null) return;
      try {
        const found = await findNewPayment(stellarAddress, {
          sinceLedger: sinceLedgerRef.current,
          expectedTotal: totalAmount,
        });
        if (found) {
          setPayment(found);
          return; // bulununca polling'i durdur
        }
      } catch {
        // Ağ hatası — sessizce bir sonraki turda tekrar dene.
      }
      if (!stoppedRef.current) setTimeout(poll, POLL_INTERVAL_MS);
    }

    return () => {
      stoppedRef.current = true;
    };
  }, [stellarAddress, totalAmount]);

  const handleNewPayment = useCallback(() => {
    navigate('MerchantAmountEntry', { session: params.session ?? null, stellarAddress });
  }, [navigate, params.session, stellarAddress]);

  const handleShowGib = useCallback(async () => {
    if (!payment?.txHash || !session?.apiKey) return;
    setGibState({ status: 'loading', document: null, error: null });
    try {
      const document = await getGibDocument(payment.txHash, { apiKey: session.apiKey });
      setGibState({ status: 'loaded', document, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? 'Bu işlem için e-belge henüz üretilmedi — birkaç saniye sonra tekrar deneyin.'
          : 'e-Belge alınamadı.';
      setGibState({ status: 'error', document: null, error: message });
    }
  }, [payment, session]);

  if (payment) {
    return (
      <Screen>
        <View style={styles.centerFill}>
          <View style={styles.successBadge}>
            <Text style={{ fontSize: 32 }}>✓</Text>
          </View>
          <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.md }]}>Ödeme Alındı</Text>
          <Text style={styles.amount}>{formatDtl(payment.amount)}</Text>
          <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
            Gönderen: {shortenMiddle(payment.from)}
          </Text>
          {payment.txHash && (
            <Text
              style={[type.captionMedium, { color: colors.accent, marginTop: spacing.sm }]}
              onPress={() => Linking.openURL(stellarExpertTxUrl(payment.txHash))}
            >
              {shortenMiddle(payment.txHash, 8, 8)} ↗
            </Text>
          )}

          {payment.txHash && session?.apiKey && gibState.status !== 'loaded' && (
            <Button
              label="e-Belge Görüntüle"
              variant="secondary"
              onPress={handleShowGib}
              loading={gibState.status === 'loading'}
              style={{ marginTop: spacing.md, minWidth: 220 }}
            />
          )}
          {gibState.status === 'error' && (
            <Text style={[type.caption, { color: colors.danger, marginTop: spacing.sm, textAlign: 'center' }]}>
              {gibState.error}
            </Text>
          )}
          {gibState.status === 'loaded' && (
            <View style={{ marginTop: spacing.md, width: '100%' }}>
              <GibReceiptCard document={gibState.document} />
            </View>
          )}

          <Button label="Yeni Ödeme Al" onPress={handleNewPayment} style={{ marginTop: spacing.xl, minWidth: 220 }} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.centerFill}>
        <Text style={[type.caption, { color: colors.textMuted }]}>TUTAR</Text>
        <Text style={styles.amount}>{formatDtl(totalAmount)}</Text>

        <View style={styles.qrCard}>
          <QRCode value={payload} size={240} backgroundColor={colors.white} color={colors.textPrimary} />
        </View>

        <View style={styles.waitingRow}>
          <View style={styles.pulseDot} />
          <Text style={[type.captionMedium, { color: colors.textSecondary }]}>Ödeme bekleniyor…</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  amount: { fontFamily: 'Inter_800ExtraBold', fontSize: 36, color: colors.accent, marginTop: 4 },
  qrCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
