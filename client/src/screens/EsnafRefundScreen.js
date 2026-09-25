import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import TextField from '../components/TextField.js';
import { InlineNotice, StatusBadge } from '../components/StateViews.js';
import { colors, radii, spacing, type } from '../theme/index.js';
import { refundByDocumentNo, getMerchantTransactions, ApiError } from '../services/api.service.js';
import { formatTrDateTime } from '../utils/dates.js';
import { matchReceipts } from '../utils/receiptSearch.js';
import { useNavigation } from '../navigation/Navigator.js';
import { formatTl } from '../utils/format.js';

/**
 * İade (prototip): esnaf fişin "Belge No"sunu yazmaya başlar, eşleşen geçmiş fişlerden
 * birini seçer; ödeme kesintiler dahil TAMAMEN müşteriye geri döner. Kısmi iade yok;
 * bir fiş bir kez iade edilir.
 */
export default function EsnafRefundScreen({ params }) {
  const { session, documentNo: initialNo = '' } = params;
  const { goBack } = useNavigation();
  const [documentNo, setDocumentNo] = useState(initialNo);
  const [state, setState] = useState({ status: 'idle', result: null, error: null });
  const [receipts, setReceipts] = useState({ status: 'loading', items: [] });

  // Son 50 fiş bir kez alınır; eşleştirme cihazda, yazarken anında yapılır.
  useEffect(() => {
    let alive = true;
    getMerchantTransactions(session.merchantId, session.apiKey, { limit: 50 })
      .then((res) => alive && setReceipts({ status: 'ready', items: res.items ?? [] }))
      .catch(() => alive && setReceipts({ status: 'error', items: [] }));
    return () => {
      alive = false;
    };
  }, [session]);

  const suggestions = useMemo(() => matchReceipts(receipts.items, documentNo), [receipts.items, documentNo]);
  const exactMatch = receipts.items.find((it) => it.gibDocumentNo === documentNo.trim());

  const submit = useCallback(async () => {
    const no = documentNo.trim();
    if (!no) {
      setState({ status: 'idle', result: null, error: 'Fiş numarasını girin.' });
      return;
    }
    setState({ status: 'loading', result: null, error: null });
    try {
      const result = await refundByDocumentNo(session.merchantId, session.apiKey, no);
      setState({ status: 'done', result, error: null });
    } catch (err) {
      setState({
        status: 'idle',
        result: null,
        error: err instanceof ApiError ? err.message : 'İade yapılamadı.',
      });
    }
  }, [documentNo, session]);

  if (state.status === 'done') {
    const { result } = state;
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
            <StatusBadge tone="success" icon="check" />
            <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.lg }]}>İade tamamlandı</Text>
            <Text style={[type.display, { color: colors.textPrimary, marginTop: spacing.sm }]}>
              {formatTl(result.refundedAmount)}
            </Text>
            <Text style={[type.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              {result.documentNo} numaralı fişin tutarı, kesintiler dahil müşteriye geri döndü.
            </Text>
          </View>
          <Button label="Tamam" onPress={goBack} style={{ marginTop: spacing.xl }} />
        </ScrollView>
      </Screen>
    );
  }

  const loading = state.status === 'loading';
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <BackButton style={{ marginBottom: spacing.sm }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>İade</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
          Fiş numarasının bir kısmını yazın, eşleşen fişlerden seçin. Tutarın tamamı, kesintiler dahil, ödemeyi yapan müşteriye geri döner.
        </Text>

        <TextField
          label="Belge No"
          value={documentNo}
          onChangeText={setDocumentNo}
          placeholder="Numaranın bir kısmını yazın"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
          style={{ marginTop: spacing.lg }}
        />

        {!loading && !exactMatch && receipts.status === 'ready' ? (
          <View style={styles.suggestBox}>
            <Text style={[type.micro, { color: colors.textMuted, padding: spacing.sm, paddingBottom: 4 }]}>
              {documentNo.trim() ? 'EŞLEŞEN FİŞLER' : 'SON FİŞLER'}
            </Text>
            {suggestions.length === 0 ? (
              <Text style={[type.caption, { color: colors.textMuted, padding: spacing.sm }]}>
                Eşleşen fiş yok.
              </Text>
            ) : (
              suggestions.map((it) => (
                <Pressable
                  key={it.id}
                  disabled={it.refunded}
                  onPress={() => setDocumentNo(it.gibDocumentNo)}
                  style={({ pressed }) => [styles.suggestRow, pressed && { backgroundColor: colors.bgCardAlt }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[type.mono, { color: it.refunded ? colors.textMuted : colors.textPrimary }]}>
                      {it.gibDocumentNo}
                    </Text>
                    <Text style={[type.caption, { color: colors.textMuted }]}>{formatTrDateTime(it.createdAt)}</Text>
                  </View>
                  {it.refunded ? (
                    <Text style={[type.captionMedium, { color: colors.warning }]}>İade edildi</Text>
                  ) : (
                    <Text style={[type.bodyMedium, { color: colors.textPrimary }]}>{formatTl(it.totalAmount)}</Text>
                  )}
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {exactMatch ? (
          <View style={styles.selectedCard}>
            <Text style={[type.caption, { color: colors.textMuted }]}>Seçilen fiş</Text>
            <Text style={[type.h2, { color: colors.textPrimary, marginTop: 2 }]}>{formatTl(exactMatch.totalAmount)}</Text>
            <Text style={[type.caption, { color: colors.textMuted }]}>{formatTrDateTime(exactMatch.createdAt)}</Text>
            {exactMatch.refunded ? (
              <Text style={[type.captionMedium, { color: colors.warning, marginTop: 4 }]}>Bu fiş zaten iade edildi.</Text>
            ) : null}
          </View>
        ) : null}

        {state.error ? (
          <InlineNotice tone="danger" style={{ marginTop: spacing.md }}>
            {state.error}
          </InlineNotice>
        ) : null}

        <InlineNotice tone="info" style={{ marginTop: spacing.md }}>
          Tam iade yapılır, bir fiş yalnızca bir kez iade edilebilir. İade tutarı işletme bakiyenizden düşer.
          İşlem zincirde birkaç adımda tamamlanır, 20-30 saniye sürebilir.
        </InlineNotice>

        <Button
          label={loading ? 'İade işleniyor…' : 'İadeyi Onayla'}
          icon="refresh"
          loading={loading}
          disabled={loading}
          onPress={submit}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  suggestBox: {
    marginTop: spacing.xs,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
});
