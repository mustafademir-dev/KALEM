import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '../Button.js';
import { EmptyState, InlineNotice, Skeleton } from '../StateViews.js';
import TransactionRow from './TransactionRow.js';
import { TAB_BAR_CLEARANCE } from './MerchantTabBar.js';
import { colors, radii, spacing, type } from '../../theme/index.js';
import { getMerchantTransactions, ApiError } from '../../services/api.service.js';

const PAGE_SIZE = 20;

function describeError(err) {
  if (err instanceof ApiError && err.code === 'NETWORK_ERROR') return err.message;
  return 'Faturalar alınamadı.';
}

/** Faturalarım: esnafın aldığı tüm ödemeler (tutar, tarih, komisyon, fiş bağlantısı), sayfalı. */
export default function InvoicesTab({ session, onOpenReceipt }) {
  const [state, setState] = useState({ status: 'loading', items: [], nextCursor: null, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadFirst = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: null }));
    try {
      const page = await getMerchantTransactions(session.merchantId, session.apiKey, { limit: PAGE_SIZE });
      if (aliveRef.current) setState({ status: 'ready', items: page.items, nextCursor: page.nextCursor, error: null });
    } catch (err) {
      if (aliveRef.current) setState({ status: 'error', items: [], nextCursor: null, error: describeError(err) });
    }
  }, [session]);

  useEffect(() => {
    loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getMerchantTransactions(session.merchantId, session.apiKey, {
        limit: PAGE_SIZE,
        cursor: state.nextCursor,
      });
      if (aliveRef.current) {
        setState((s) => ({ ...s, items: [...s.items, ...page.items], nextCursor: page.nextCursor }));
      }
    } catch (err) {
      if (aliveRef.current) setState((s) => ({ ...s, error: describeError(err) }));
    } finally {
      if (aliveRef.current) setLoadingMore(false);
    }
  }, [session, state.nextCursor, loadingMore]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={[type.h1, { color: colors.textPrimary }]}>Faturalarım</Text>
      <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
        Aldığınız tüm ödemeler ve fişleri
      </Text>

      <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
        {state.status === 'loading' &&
          [0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} style={{ borderRadius: 20 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width={110} height={16} />
                <Skeleton width={170} height={12} />
              </View>
            </View>
          ))}

        {state.status === 'error' && (
          <EmptyState
            icon="receipt"
            title="Faturalar yüklenemedi"
            text={state.error}
            action={<Button label="Tekrar dene" icon="refresh" variant="secondary" onPress={loadFirst} />}
          />
        )}

        {state.status === 'ready' && state.items.length === 0 && (
          <EmptyState
            icon="receipt"
            title="Henüz fatura yok"
            text="Aldığınız her ödeme için otomatik bir fiş üretilir ve burada listelenir."
          />
        )}

        {state.status === 'ready' &&
          state.items.map((item) => <TransactionRow key={item.id} item={item} onOpenReceipt={onOpenReceipt} />)}
      </View>

      {state.status === 'ready' && state.error && (
        <InlineNotice tone="danger" style={{ marginTop: spacing.md }}>
          {state.error}
        </InlineNotice>
      )}

      {state.status === 'ready' && state.nextCursor && (
        <Button
          label="Daha fazla göster"
          variant="secondary"
          onPress={loadMore}
          loading={loadingMore}
          style={{ marginTop: spacing.md }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
