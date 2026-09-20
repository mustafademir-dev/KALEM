import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import GibReceiptCard from '../components/GibReceiptCard.js';
import { EmptyState, InlineNotice, Skeleton } from '../components/StateViews.js';
import { colors, spacing, type } from '../theme/index.js';
import { getGibDocument, ApiError } from '../services/api.service.js';
import { formatTl, stroopsToFixed2 } from '../utils/format.js';

/**
 * Bir işlemin GİB fişi (Faturalarım / Son işlemler → Fiş). Fiş `GET /transactions/:txHash/gib-document`
 * ile alınır (esnaf kendi anahtarıyla, yalnızca kendi işlemini görür).
 */
export default function EsnafReceiptScreen({ params }) {
  const { session, txHash, totalAmount } = params;
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
      const document = await getGibDocument(txHash, { apiKey: session.apiKey });
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
  }, [txHash, session]);

  useEffect(() => {
    load();
  }, [load]);

  // 19 Eylül 2026 düzeltmesinden ÖNCE üretilmiş fişler stroop'u TL sayıyordu (5 TL → 50.000.000 TL).
  // Eski belgelere DOKUNULMAZ; yalnızca ekranda dürüstçe uyarılır ve doğru tutar gösterilir.
  const legacyMismatch =
    state.status === 'ready' &&
    totalAmount &&
    state.document?.totalAmountTL !== undefined &&
    Math.abs(Number(state.document.totalAmountTL) - Number(stroopsToFixed2(totalAmount))) > 0.005;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <BackButton style={{ marginBottom: spacing.sm }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>Fiş</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>e-Belge / ÖKC fişi (simülasyon)</Text>

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
                  Bu fiş, tutar hesabı düzeltilmeden önce üretildi; aşağıdaki rakamlar hatalı olabilir. İşlemin doğru
                  tutarı {formatTl(totalAmount)}.
                </InlineNotice>
              )}
              <GibReceiptCard document={state.document} />
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
