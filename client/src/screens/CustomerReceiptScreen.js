import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import GibReceiptCard from '../components/GibReceiptCard.js';
import ReceiptActions from '../components/ReceiptActions.js';
import { EmptyState, InlineNotice, Skeleton } from '../components/StateViews.js';
import { colors, spacing, type } from '../theme/index.js';
import { getGibDocument, ApiError } from '../services/api.service.js';
import { formatTl, stroopsToFixed2 } from '../utils/format.js';

/**
 * Müşterinin bir ödemesine ait GİB fişi (Fişlerim → Fiş).
 *
 * `EsnafReceiptScreen` ile aynı yapıdadır; tek fark yetkilendirmedir: esnaf
 * kendi API anahtarıyla, müşteri ise ödemeyi yapan cüzdan adresiyle
 * (`?senderAddress=`) belgeye erişir. Belge burada SAKLANMAZ, her açılışta
 * sunucudan taze alınır.
 */
export default function CustomerReceiptScreen({ params }) {
  const { txHash, totalAmount, paidAt, senderAddress } = params;
  const [state, setState] = useState({ status: 'loading', document: null, error: null });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState({ status: 'loading', document: null, error: null });
    try {
      const document = await getGibDocument(txHash, { senderAddress });
      if (aliveRef.current) setState({ status: 'ready', document, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? 'Bu işlem için e-belge henüz üretilmedi — birkaç saniye sonra tekrar deneyin.'
          : err instanceof ApiError && err.code === 'NETWORK_ERROR'
            ? err.message
            : 'Fiş alınamadı.';
      if (aliveRef.current) setState({ status: 'error', document: null, error: message });
    }
  }, [txHash, senderAddress]);

  useEffect(() => {
    load();
  }, [load]);

  // 19 Eylül 2026 düzeltmesinden ÖNCE üretilmiş fişler stroop'u TL sayıyordu.
  // Eski belgelere DOKUNULMAZ; yalnızca ekranda (ve indirilen metinde) uyarılır.
  const legacyMismatch =
    state.status === 'ready' &&
    totalAmount &&
    state.document?.totalAmountTL !== undefined &&
    Math.abs(Number(state.document.totalAmountTL) - Number(stroopsToFixed2(totalAmount))) > 0.005;

  const legacyWarning = legacyMismatch
    ? `Bu fiş, tutar hesabı düzeltilmeden önce üretildi; aşağıdaki rakamlar hatalı olabilir. İşlemin doğru tutarı ${formatTl(totalAmount)}.`
    : undefined;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <BackButton style={{ marginBottom: spacing.sm }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>Fiş</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>e-Belge</Text>

        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          {state.status === 'loading' && (
            <View style={styles.skeletonCard}>
              <Skeleton width={140} height={20} />
              <Skeleton width="100%" height={14} style={{ marginTop: 14 }} />
              <Skeleton width="100%" height={14} style={{ marginTop: 10 }} />
              <Skeleton width="70%" height={14} style={{ marginTop: 10 }} />
              <Skeleton width="100%" height={40} style={{ marginTop: 24, borderRadius: 10 }} />
            </View>
          )}

          {state.status === 'error' && (
            <EmptyState
              icon="receipt"
              title="Fiş açılamadı"
              text={state.error}
              action={<Button label="Tekrar dene" icon="refresh" variant="secondary" onPress={load} />}
            />
          )}

          {state.status === 'ready' && (
            <>
              {legacyMismatch && (
                <InlineNotice tone="warning" style={{ alignSelf: 'stretch', marginBottom: spacing.md }}>
                  {legacyWarning}
                </InlineNotice>
              )}
              {state.document?.refund ? (
                <InlineNotice tone="success" style={{ alignSelf: 'stretch', marginBottom: spacing.md }}>
                  Bu ödeme iade edildi; tutar hesabınıza geri yüklendi.
                </InlineNotice>
              ) : null}
              <GibReceiptCard document={state.document} />
              <ReceiptActions
                document={state.document}
                txHash={txHash}
                paidAt={paidAt}
                warning={legacyWarning}
              />
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  skeletonCard: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
