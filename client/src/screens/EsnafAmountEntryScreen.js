import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import TextField from '../components/TextField.js';
import BackButton from '../components/BackButton.js';
import { colors, spacing, type } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { buildQrPayload } from '../utils/qrPayload.js';
import { dtlToStroops } from '../utils/format.js';

export default function EsnafAmountEntryScreen({ params }) {
  const { session, stellarAddress } = params;
  const { navigate } = useNavigation();
  const [amountText, setAmountText] = useState('');

  const totalAmount = useMemo(() => {
    if (!/^\d+([.,]\d{0,7})?$/.test(amountText.trim())) return null;
    const normalized = amountText.trim().replace(',', '.');
    const stroops = dtlToStroops(normalized);
    return BigInt(stroops) > 0n ? stroops : null;
  }, [amountText]);

  const handleGenerate = useCallback(() => {
    if (!totalAmount) return;
    const payload = buildQrPayload({
      merchantId: session.merchantId,
      stellarAddress,
      businessName: session.businessName,
      totalAmount,
    });
    navigate('MerchantQr', { payload, totalAmount, stellarAddress, session });
  }, [totalAmount, session, stellarAddress, navigate]);

  return (
    <Screen>
      <View style={styles.wrap}>
        <BackButton style={{ marginBottom: spacing.md }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>Tutar Girin</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4, marginBottom: spacing.xl }]}>
          Müşteriden alınacak tutarı dTL cinsinden girin
        </Text>

        <TextField
          value={amountText}
          onChangeText={setAmountText}
          placeholder="0.00"
          keyboardType="decimal-pad"
          style={styles.amountField}
        />
        <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>dTL</Text>
      </View>

      <View style={styles.footer}>
        <Button label="QR Oluştur" onPress={handleGenerate} disabled={!totalAmount} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: spacing.lg, paddingTop: spacing.xl },
  amountField: { marginTop: spacing.sm },
  footer: { padding: spacing.lg },
});
