import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import BackButton from '../components/BackButton.js';
import { colors, radii, spacing, type } from '../theme/index.js';
import { getIncomingTransfers } from '../services/merchant-chain.service.js';
import { formatDtl, shortenMiddle, stellarExpertTxUrl } from '../utils/format.js';

export default function EsnafHistoryScreen({ params }) {
  const { stellarAddress } = params;
  const [state, setState] = useState({ loading: true, error: null, items: [] });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const items = await getIncomingTransfers(stellarAddress, { limit: 50 });
      setState({ loading: false, error: null, items });
    } catch {
      setState({ loading: false, error: 'İşlem geçmişi alınamadı.', items: [] });
    }
  }, [stellarAddress]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen>
      <View style={styles.header}>
        <BackButton style={{ marginBottom: spacing.sm }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>İşlem Geçmişi</Text>
        <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>
          Son ~birkaç saatlik zincir üzeri gelen ödemeler
        </Text>
      </View>

      {state.loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : state.error ? (
        <View style={styles.centerFill}>
          <Text style={[type.body, { color: colors.danger }]}>{state.error}</Text>
        </View>
      ) : state.items.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>
            Bu pencerede henüz bir ödeme yok.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {state.items.map((item, idx) => (
            <View key={`${item.ledger}-${idx}`} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[type.bodyMedium, { color: colors.textPrimary }]}>{formatDtl(item.amount)}</Text>
                <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>
                  {shortenMiddle(item.from)} · Ledger {item.ledger}
                </Text>
              </View>
              {item.txHash ? (
                <Text
                  style={[type.captionMedium, { color: colors.accent }]}
                  onPress={() => Linking.openURL(stellarExpertTxUrl(item.txHash))}
                >
                  Gör ↗
                </Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: spacing.lg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
