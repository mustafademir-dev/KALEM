import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon.js';
import { colors, spacing, type } from '../../theme/index.js';

const TABS = [
  { key: 'home', label: 'Ana Sayfa', icon: 'home' },
  { key: 'invoices', label: 'Faturalarım', icon: 'receipt' },
  { key: 'report', label: 'Gün Sonu', icon: 'calendar' },
  { key: 'account', label: 'Hesap', icon: 'user' },
];

const BAR_HEIGHT = 68;
const PAY_SIZE = 88; // diğer sekme ikonlarının (22 px) ~4 katı
const PROTRUDE = 40; // düğmenin çubuğun üstüne taşan kısmı

/** Sekme içeriğinin (ScrollView) alt boşluğu: içerik çubuğun ARKASINDAN akar, son öğe örtülmez. */
export const TAB_BAR_CLEARANCE = BAR_HEIGHT + PROTRUDE + 24;

/**
 * Esnaf alt çubuğu: 2 sekme · ORTADA BÜYÜK "Ödeme Al" · 2 sekme.
 * Ödeme Al, esnafın en sık kullandığı eylemdir; bu yüzden çubuğun üstüne taşan, diğer
 * ikonlardan bariz büyük, amber dolgulu bir düğmedir. Sekmeler yalnızca sunumdur.
 */
export default function MerchantTabBar({ active, onSelect, onPay }) {
  const left = TABS.slice(0, 2);
  const right = TABS.slice(2);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        {left.map((tab) => (
          <TabItem key={tab.key} tab={tab} active={active === tab.key} onPress={() => onSelect(tab.key)} />
        ))}
        <View style={styles.centerSlot} />
        {right.map((tab) => (
          <TabItem key={tab.key} tab={tab} active={active === tab.key} onPress={() => onSelect(tab.key)} />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ödeme Al"
        onPress={onPay}
        style={({ pressed }) => [styles.payButton, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
      >
        <Icon name="qr" size={40} color={colors.white} strokeWidth={2.2} />
      </Pressable>
      <Text style={styles.payLabel} pointerEvents="none">
        ÖDEME AL
      </Text>
    </View>
  );
}

function TabItem({ tab, active, onPress }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      style={styles.tab}
    >
      <Icon name={tab.icon} size={22} color={active ? colors.accent : colors.textMuted} strokeWidth={active ? 2.3 : 2} />
      <Text style={[type.micro, { color: active ? colors.accent : colors.textMuted, marginTop: 3 }]} numberOfLines={1}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Şeffaf üst şerit, taşan düğmenin dokunma alanını da kapsar (Android dışına dokunmayı yutar).
  wrap: { height: BAR_HEIGHT + PROTRUDE, justifyContent: 'flex-end', alignItems: 'center' },
  bar: {
    height: BAR_HEIGHT,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.xs,
  },
  centerSlot: { width: PAY_SIZE },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xs },
  payButton: {
    position: 'absolute',
    top: 0,
    width: PAY_SIZE,
    height: PAY_SIZE,
    borderRadius: PAY_SIZE / 2,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: colors.bg, // çubuğa "oyulmuş" görünüm
    shadowColor: colors.accentStrong,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  payLabel: {
    position: 'absolute',
    bottom: 6,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 11,
    letterSpacing: 1,
    color: colors.accentStrong,
  },
});
