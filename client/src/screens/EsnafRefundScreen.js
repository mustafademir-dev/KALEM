import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import TextField from '../components/TextField.js';
import { InlineNotice, StatusBadge } from '../components/StateViews.js';
import { colors, spacing, type } from '../theme/index.js';
import { refundByDocumentNo, ApiError } from '../services/api.service.js';
import { useNavigation } from '../navigation/Navigator.js';
import { formatTl, shortenMiddle } from '../utils/format.js';

/**
 * İade (prototip): esnaf fişteki "Belge No"yu girer, ödeme kesintiler dahil TAMAMEN
 * müşteriye geri döner. Kısmi iade yok; bir fiş bir kez iade edilir.
 */
export default function EsnafRefundScreen({ params }) {
  const { session, documentNo: initialNo = '' } = params;
  const { goBack } = useNavigation();
  const [documentNo, setDocumentNo] = useState(initialNo);
  const [state, setState] = useState({ status: 'idle', result: null, error: null });

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
            <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
              Müşteri: {shortenMiddle(result.customerAddress, 6, 6)}
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
          Fişteki "Belge No"yu girin. Tutarın tamamı, kesintiler dahil, ödemeyi yapan müşteriye geri döner.
        </Text>

        <TextField
          label="Belge No"
          value={documentNo}
          onChangeText={setDocumentNo}
          placeholder="KALEM20260925123456"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading}
          style={{ marginTop: spacing.lg }}
        />

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
});
