import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon.js';
import { colors, radii, spacing, type } from '../theme/index.js';

/**
 * Kapalı gelen "Teknik bilgiler" bölümü: cüzdan adresi, ağ gibi günlük kullanımda
 * gerekmeyen ama gerektiğinde (destek, zincirde doğrulama) ulaşılabilmesi gereken
 * bilgiler. `rows`: `[{ label, value, mono }]`.
 */
export default function TechnicalDetails({ rows, style }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.card, style]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <Text style={[type.captionMedium, { color: colors.textSecondary, flex: 1 }]}>Teknik bilgiler</Text>
        <Icon name={open ? 'chevronLeft' : 'chevronRight'} size={16} color={colors.textMuted} />
      </Pressable>
      {open
        ? rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <Text style={[type.caption, { color: colors.textMuted }]}>{r.label}</Text>
              <Text selectable style={[r.mono ? type.mono : type.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {r.value}
              </Text>
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  row: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
});
