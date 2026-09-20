import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import Icon from '../components/Icon.js';
import { colors, radii, spacing, type, fonts } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { buildQrPayload } from '../utils/qrPayload.js';
import { displayParts, pressKey, toStroops } from '../utils/amountInput.js';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  [',', '0', 'back'],
];
const QUICK_AMOUNTS = ['10', '25', '50', '100'];

/**
 * Ödeme Al — tutar girişi. Sayısal klavye (kuruş dahil, en fazla 2 ondalık) ve hızlı tutarlar;
 * web'de fiziksel klavye de çalışır. Tutar TL olarak girilir (1 dTL = 1 TL); QR yükü ve
 * zincir tutarı (stroop) eskisiyle AYNI biçimde üretilir.
 */
export default function EsnafAmountEntryScreen({ params }) {
  const { session, stellarAddress } = params;
  const { navigate } = useNavigation();
  const [text, setText] = useState('');

  const totalAmount = useMemo(() => toStroops(text), [text]);
  const { whole, fraction, hasComma } = displayParts(text);

  const press = useCallback((key) => setText((current) => pressKey(current, key)), []);

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

  // Masaüstü/web demosu: fiziksel klavye (rakamlar, virgül/nokta, Backspace, Enter).
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (/^[0-9]$/.test(event.key)) press(event.key);
      else if (event.key === ',' || event.key === '.') press(',');
      else if (event.key === 'Backspace') press('back');
      else if (event.key === 'Escape') press('clear');
      else if (event.key === 'Enter') handleGenerate();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [press, handleGenerate]);

  return (
    <Screen>
      <View style={styles.top}>
        <BackButton style={{ marginBottom: spacing.sm }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>Ödeme Al</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>Müşteriden alınacak tutarı girin</Text>
      </View>

      <View style={styles.display}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          accessibilityLabel={`Tutar: ${text || '0'} TL`}
          style={[styles.amountText, { color: text ? colors.textPrimary : colors.textMuted }]}
        >
          {whole}
          {hasComma ? `,${fraction}` : ''}
          <Text style={styles.unit}> TL</Text>
        </Text>
        <View style={styles.quickRow}>
          {QUICK_AMOUNTS.map((amount) => (
            <Pressable
              key={amount}
              onPress={() => setText(amount)}
              accessibilityRole="button"
              accessibilityLabel={`${amount} TL`}
              style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.accentMuted }]}
            >
              <Text style={[type.captionMedium, { color: colors.textSecondary }]}>{amount} TL</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.pad}>
        {KEYS.map((row, r) => (
          <View key={r} style={styles.padRow}>
            {row.map((key) => (
              <Key key={key} value={key} onPress={press} onLongBack={() => press('clear')} />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Button label="QR Oluştur" icon="qr" onPress={handleGenerate} disabled={!totalAmount} />
      </View>
    </Screen>
  );
}

function Key({ value, onPress, onLongBack }) {
  const isBack = value === 'back';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isBack ? 'Sil' : value === ',' ? 'Virgül' : value}
      onPress={() => onPress(value)}
      onLongPress={isBack ? onLongBack : undefined}
      style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.accentMuted, borderColor: colors.accent }]}
    >
      {isBack ? (
        <Icon name="backspace" size={26} color={colors.textSecondary} />
      ) : (
        <Text style={styles.keyText}>{value}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  display: { flex: 1, minHeight: 130, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  amountText: { fontFamily: fonts.extraBold, fontSize: 56, lineHeight: 66, letterSpacing: -1 },
  unit: { fontFamily: fonts.semiBold, fontSize: 24, letterSpacing: 0, color: colors.textMuted },
  quickRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pad: { paddingHorizontal: spacing.lg, gap: spacing.xs },
  padRow: { flexDirection: 'row', gap: spacing.xs },
  key: {
    flex: 1,
    height: 60,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontFamily: fonts.semiBold, fontSize: 26, color: colors.textPrimary },
  footer: { padding: spacing.lg },
});
