import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon.js';
import { colors, radii, spacing, type } from '../../theme/index.js';
import { formatTl } from '../../utils/format.js';
import { formatTrDateTime } from '../../utils/dates.js';

/**
 * Müşterinin bir ödemesinin liste satırı: tutar, işyeri, tarih ve fişe bağlantı.
 * `item`, cihazdaki fiş arşivinin bir kaydıdır (bkz. utils/receiptArchive.js).
 * Ana sayfadaki "son işlemler" ile Fişlerim sekmesi AYNI satırı kullanır.
 */
export default function ReceiptRow({ item, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${formatTl(item.totalAmount)}, ${item.businessName ?? 'işyeri bilinmiyor'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgCardAlt }]}
    >
      <View style={styles.icon}>
        <Icon name="receipt" size={20} color={colors.accentStrong} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>{formatTl(item.totalAmount)}</Text>
        <Text style={[type.caption, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>
          {item.businessName ?? 'İşyeri bilgisi yok'}
        </Text>
        <Text style={[type.caption, { color: colors.textMuted, marginTop: 1 }]}>{formatTrDateTime(item.paidAt)}</Text>
      </View>

      <View style={styles.pill}>
        <Text style={[type.captionMedium, { color: colors.accentStrong }]}>Fiş</Text>
        <Icon name="chevronRight" size={14} color={colors.accentStrong} />
      </View>
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
    backgroundColor: colors.accentMuted,
  },
  pill: {
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
