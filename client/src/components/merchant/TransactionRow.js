import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon.js';
import { colors, radii, spacing, type } from '../../theme/index.js';
import { formatTl } from '../../utils/format.js';
import { formatTrDateTime } from '../../utils/dates.js';

/**
 * Bir ödemenin liste satırı: tutar, tarih/saat, komisyon/net (yoksa "veri yok") ve fişe bağlantı.
 * `item`, `GET /merchants/:id/transactions` satırıdır (tutarlar stroop string'i).
 */
export default function TransactionRow({ item, onOpenReceipt }) {
  const canOpen = item.hasGibDocument && typeof onOpenReceipt === 'function';

  return (
    <Pressable
      accessibilityRole={canOpen ? 'button' : undefined}
      accessibilityLabel={`${formatTl(item.totalAmount)}, ${formatTrDateTime(item.createdAt)}`}
      disabled={!canOpen}
      onPress={canOpen ? () => onOpenReceipt(item) : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgCardAlt }]}
    >
      <View style={[styles.icon, { backgroundColor: item.hasGibDocument ? colors.accentMuted : colors.bgCardAlt }]}>
        <Icon name="receipt" size={20} color={item.hasGibDocument ? colors.accentStrong : colors.textMuted} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>{formatTl(item.totalAmount)}</Text>
        <Text style={[type.caption, { color: colors.textMuted, marginTop: 1 }]}>{formatTrDateTime(item.createdAt)}</Text>
        {item.hasBreakdown ? (
          <View style={{ marginTop: 2 }}>
            <Text style={[type.caption, { color: colors.textMuted }]}>Komisyon {formatTl(item.commission)}</Text>
            <Text style={[type.captionMedium, { color: colors.success }]}>Net {formatTl(item.net)}</Text>
          </View>
        ) : (
          <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>Komisyon verisi yok</Text>
        )}
      </View>

      {canOpen ? (
        <View style={styles.receiptPill}>
          <Text style={[type.captionMedium, { color: colors.accentStrong }]}>Fiş</Text>
          <Icon name="chevronRight" size={14} color={colors.accentStrong} />
        </View>
      ) : (
        <Text style={[type.caption, { color: colors.textMuted }]}>Fiş yok</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: spacing.sm,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
  },
});
