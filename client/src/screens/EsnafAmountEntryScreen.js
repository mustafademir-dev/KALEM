import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import BackButton from '../components/BackButton.js';
import Icon from '../components/Icon.js';
import { colors, radii, spacing, type, fonts } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { buildQrPayload } from '../utils/qrPayload.js';
import { displayParts, pressKey, toStroops } from '../utils/amountInput.js';
import { DEFAULT_DEPARTMENTS, kurusToTl, vatSplit } from '../utils/vat.js';
import { getDepartments } from '../services/api.service.js';

// Yazar kasa tuş takımı: hesap makinesi düzeni (7-8-9 üstte).
const KEYS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  [',', '0', 'back'],
];

// Kısım tuşu renkleri — fiziksel yazar kasalardaki renkli departman tuşlarını andırır.
const DEPT_TINTS = ['#E8F1FB', '#E6F4EC', '#FDF3E2', '#F3E8FB', '#FBEAEA', '#E9F7F7', '#F1F3F6', '#FFF8D6'];

const LCD = { bg: '#14231C', text: '#E6FFF0', dim: '#7FC6A0', line: '#23392E' };

/**
 * Ödeme Al — yazar kasa POS düzeninde tutar + departman (kısım) girişi.
 *
 * Esnaf tutarı girer, departmanı seçer: KDV oranı departmandan gelir ve ödeme
 * verisine (QR) tek satırlık sepet olarak eklenir; fiş bu oranla kesilir. Ekrandaki
 * matrah/KDV fişle birebir aynı hesaptır. Web'de fiziksel klavye de çalışır.
 */
export default function EsnafAmountEntryScreen({ params }) {
  const { session, stellarAddress } = params;
  const { navigate } = useNavigation();
  const [text, setText] = useState('');
  const [departments, setDepartments] = useState(DEFAULT_DEPARTMENTS);
  const [deptIndex, setDeptIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    getDepartments(session.merchantId, session.apiKey)
      .then((res) => {
        if (alive && Array.isArray(res.departments) && res.departments.length > 0) setDepartments(res.departments);
      })
      .catch(() => {}); // çevrimdışıysa varsayılanlarla devam
    return () => {
      alive = false;
    };
  }, [session]);

  const department = departments[Math.min(deptIndex, departments.length - 1)];
  const totalAmount = useMemo(() => toStroops(text), [text]);
  const split = useMemo(() => vatSplit(totalAmount, department.vatRate), [totalAmount, department]);
  const { whole, fraction, hasComma } = displayParts(text);

  const press = useCallback((key) => setText((current) => pressKey(current, key)), []);

  const handleGenerate = useCallback(() => {
    if (!totalAmount) return;
    const payload = buildQrPayload({
      merchantId: session.merchantId,
      stellarAddress,
      businessName: session.businessName,
      totalAmount,
      cartItems: [{ name: department.name, quantity: 1, price: totalAmount, vatRate: department.vatRate }],
    });
    navigate('MerchantQr', { payload, totalAmount, stellarAddress, session });
  }, [totalAmount, session, stellarAddress, navigate, department]);

  // Masaüstü/web: fiziksel klavye (rakamlar, virgül/nokta, Backspace, Esc, Enter).
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target?.tagName === 'INPUT') return;
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <BackButton />
          <Text style={[type.h2, { color: colors.textPrimary }]}>Ödeme Al</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Ekran (LCD) */}
        <View style={styles.lcd} accessibilityLabel={`${department.name}, yüzde ${department.vatRate} KDV, ${text || '0'} TL`}>
          <View style={styles.lcdTop}>
            <Text style={styles.lcdSmall} numberOfLines={1}>
              {department.name.toLocaleUpperCase('tr')} · %{department.vatRate} KDV
            </Text>
            <Text style={styles.lcdSmall}>KDV DAHİL</Text>
          </View>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.lcdAmount, !text && { color: LCD.dim }]}>
            {whole}
            {hasComma ? `,${fraction}` : ''}
            <Text style={styles.lcdUnit}> TL</Text>
          </Text>
          <View style={styles.lcdLine} />
          <View style={styles.lcdTop}>
            <Text style={styles.lcdSmall}>MATRAH {split ? kurusToTl(split.exclKurus) : '0,00'}</Text>
            <Text style={styles.lcdSmall}>KDV {split ? kurusToTl(split.vatKurus) : '0,00'}</Text>
          </View>
        </View>

        {/* Kısım / departman tuşları */}
        <View style={styles.sectionHead}>
          <Text style={[type.micro, { color: colors.textMuted }]}>KISIM / DEPARTMAN</Text>
          <Pressable onPress={() => navigate('MerchantDepartments', { session })} hitSlop={8}>
            <Text style={[type.captionMedium, { color: colors.accent }]}>Düzenle</Text>
          </Pressable>
        </View>
        <View style={styles.deptGrid}>
          {departments.map((d, i) => {
            const selected = i === Math.min(deptIndex, departments.length - 1);
            return (
              <Pressable
                key={`${d.name}-${i}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${d.name}, yüzde ${d.vatRate} KDV`}
                onPress={() => setDeptIndex(i)}
                style={({ pressed }) => [
                  styles.deptKey,
                  { backgroundColor: DEPT_TINTS[i % DEPT_TINTS.length] },
                  selected && styles.deptKeySelected,
                  pressed && { transform: [{ translateY: 1 }] },
                ]}
              >
                <Text style={[type.captionMedium, { color: colors.textPrimary }]} numberOfLines={1}>
                  {d.name}
                </Text>
                <Text style={[type.micro, { color: colors.textSecondary }]}>%{d.vatRate}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tuş takımı */}
        <View style={styles.pad}>
          {KEYS.map((row, r) => (
            <View key={r} style={styles.padRow}>
              {row.map((key) => (
                <Key key={key} value={key} onPress={press} onLongBack={() => press('clear')} />
              ))}
            </View>
          ))}
          <View style={styles.padRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Temizle"
              onPress={() => press('clear')}
              style={({ pressed }) => [styles.key, styles.clearKey, pressed && styles.keyPressed]}
            >
              <Text style={[styles.keyText, { color: colors.danger }]}>C</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ödeme al, QR oluştur"
              disabled={!totalAmount}
              onPress={handleGenerate}
              style={({ pressed }) => [
                styles.key,
                styles.okKey,
                !totalAmount && { opacity: 0.45 },
                pressed && styles.keyPressed,
              ]}
            >
              <Icon name="qr" size={22} color={colors.white} />
              <Text style={styles.okText}>ÖDEME AL</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
    >
      {isBack ? (
        <Icon name="backspace" size={24} color={colors.textSecondary} />
      ) : (
        <Text style={styles.keyText}>{value}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.md, paddingBottom: spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  lcd: {
    backgroundColor: LCD.bg,
    borderRadius: 14,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 3,
    borderColor: '#0B1511',
  },
  lcdTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  lcdSmall: { fontFamily: fonts.mono, fontSize: 12, color: LCD.dim, letterSpacing: 0.5 },
  lcdAmount: {
    fontFamily: fonts.mono,
    fontSize: 44,
    lineHeight: 54,
    color: LCD.text,
    textAlign: 'right',
    marginVertical: 2,
  },
  lcdUnit: { fontSize: 20, color: LCD.dim },
  lcdLine: { height: 1, backgroundColor: LCD.line, marginBottom: 4 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  deptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  deptKey: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  deptKeySelected: { borderColor: colors.accent, borderWidth: 2, borderBottomWidth: 4 },
  pad: { marginTop: spacing.md, gap: spacing.xs },
  padRow: { flexDirection: 'row', gap: spacing.xs },
  key: {
    flex: 1,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.bgCardAlt, borderBottomWidth: 1, transform: [{ translateY: 2 }] },
  keyText: { fontFamily: fonts.semiBold, fontSize: 24, color: colors.textPrimary },
  clearKey: { flex: 1, backgroundColor: colors.dangerBg, borderColor: '#E7B3B3' },
  okKey: {
    flex: 2,
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.success,
    borderColor: '#15673F',
  },
  okText: { fontFamily: fonts.bold, fontSize: 18, color: colors.white, letterSpacing: 0.5 },
});
