import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon.js';
import { colors, spacing, type } from '../theme/index.js';

const BAR_HEIGHT = 68;
const ACTION_SIZE = 88; // diğer sekme ikonlarının (22 px) ~4 katı
const PROTRUDE = 40; // düğmenin çubuğun üstüne taşan kısmı

/** Sekme içeriğinin (ScrollView) alt boşluğu: içerik çubuğun ARKASINDAN akar, son öğe örtülmez. */
export const TAB_BAR_CLEARANCE = BAR_HEIGHT + PROTRUDE + 24;

/**
 * Alt sekme çubuğu: 2 sekme · ORTADA BÜYÜK eylem düğmesi · 2 sekme.
 *
 * Esnaf ("Ödeme Al") ve müşteri ("Ödeme Yap") kabukları AYNI bileşeni kullanır;
 * yalnızca sekme listesi ve ortadaki eylem değişir. Ortadaki düğme, o rolün en
 * sık yaptığı iştir: çubuğun üstüne taşar, diğer ikonlardan bariz büyüktür ve
 * amber dolguludur. Sekmeler yalnızca sunumdur, eylem düğmesi ayrı ele alınır.
 *
 * @param {object} props
 * @param {Array<{key: string, label: string, icon: string}>} props.tabs - 4 sekme (2 sol + 2 sağ).
 * @param {string} props.active - Seçili sekmenin `key` değeri.
 * @param {(key: string) => void} props.onSelect
 * @param {() => void} props.onAction - Ortadaki büyük düğme.
 * @param {string} props.actionIcon - `Icon.js`'teki ikon adı.
 * @param {string} props.actionLabel - Düğmenin altındaki etiket (büyük harf).
 */
export default function TabBar({ tabs, active, onSelect, onAction, actionIcon, actionLabel }) {
  const half = Math.ceil(tabs.length / 2);
  const left = tabs.slice(0, half);
  const right = tabs.slice(half);

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
        accessibilityLabel={actionLabel}
        onPress={onAction}
        style={({ pressed }) => [styles.actionButton, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
      >
        <Icon name={actionIcon} size={40} color={colors.white} strokeWidth={2.2} />
      </Pressable>
      <Text style={styles.actionLabel} pointerEvents="none">
        {actionLabel}
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
  centerSlot: { width: ACTION_SIZE },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xs },
  actionButton: {
    position: 'absolute',
    top: 0,
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
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
  actionLabel: {
    position: 'absolute',
    bottom: 6,
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 11,
    letterSpacing: 1,
    color: colors.accentStrong,
  },
});
