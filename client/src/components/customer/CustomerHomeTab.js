import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Amount from '../Amount.js';
import Button from '../Button.js';
import Icon from '../Icon.js';
import TestnetBadge from '../TestnetBadge.js';
import ReceiptRow from './ReceiptRow.js';
import { EmptyState, Skeleton } from '../StateViews.js';
import { TAB_BAR_CLEARANCE } from './CustomerTabBar.js';
import { colors, radii, spacing, type, cardShadow } from '../../theme/index.js';
import { formatTl, shortenMiddle } from '../../utils/format.js';

const RECENT_COUNT = 3;

/**
 * Müşteri ana sayfası: bakiye, bu ayın özeti ve son işlemler.
 *
 * Özet ve son işlemler CİHAZDAKİ fiş arşivinden gelir (sunucuda müşteri bazlı
 * bir liste ucu YOKTUR — gerekçesi utils/receiptArchive.js dosya başında).
 * Bu yüzden "bu ay" rakamı, cihazda kayıtlı onaylı ödemelerin toplamıdır ve
 * ekranda böyle anlatılır; "tüm harcamanız" gibi bir iddiada BULUNULMAZ.
 */
export default function CustomerHomeTab({
  stellarAddress,
  balance,
  refreshing,
  onRefresh,
  receipts,
  summary,
  loading,
  onSeeAll,
  onOpenReceipt,
  onTopUp,
}) {
  const recent = receipts.slice(0, RECENT_COUNT);

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[type.caption, { color: colors.textMuted }]}>{shortenMiddle(stellarAddress, 6, 6)}</Text>
        <Text style={[type.h1, { color: colors.textPrimary }]}>Cüzdanım</Text>
        <TestnetBadge style={{ marginTop: spacing.xs }} />
      </View>

      <View style={styles.balanceCard}>
        <Text style={[type.micro, { color: colors.textMuted }]}>BAKİYE (ZİNCİRDEN)</Text>
        {balance === undefined ? (
          <Skeleton width={180} height={34} style={{ marginTop: 6 }} />
        ) : balance === null ? (
          <Text style={[type.h1, { color: colors.textMuted, marginTop: 4 }]}>Alınamadı</Text>
        ) : (
          <Amount stroops={balance} size={38} style={{ marginTop: 2 }} />
        )}

        <View style={styles.balanceActions}>
          <Pressable onPress={onRefresh} disabled={refreshing} hitSlop={8}>
            <Text style={[type.captionMedium, { color: colors.accent }]}>
              {refreshing ? 'Yenileniyor…' : 'Bakiyeyi Yenile'}
            </Text>
          </Pressable>
          <Pressable onPress={onTopUp} hitSlop={8} style={styles.topUpLink}>
            <Text style={[type.captionMedium, { color: colors.accent }]}>Bakiye Yükle</Text>
            <Icon name="chevronRight" size={14} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHead}>
          <Text style={[type.h2, { color: colors.textPrimary }]}>Bu Ay</Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            {loading ? '' : `${summary.monthCount} işlem`}
          </Text>
        </View>
        <Text style={[type.micro, { color: colors.textMuted, marginTop: spacing.sm }]}>HARCAMANIZ</Text>
        {loading ? (
          <Skeleton width={150} height={26} style={{ marginTop: 6 }} />
        ) : (
          <Text style={[type.h1, { color: colors.textPrimary, marginTop: 2 }]}>{formatTl(summary.monthTotal)}</Text>
        )}
        <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
          Bu cihazda kayıtlı onaylı ödemelerinizden hesaplanır.
        </Text>
      </View>

      <View style={styles.listHead}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>Son İşlemler</Text>
        {receipts.length > RECENT_COUNT && (
          <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAll}>
            <Text style={[type.captionMedium, { color: colors.accent }]}>Tümü</Text>
            <Icon name="chevronRight" size={14} color={colors.accent} />
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={{ gap: spacing.sm }}>
          <Skeleton width="100%" height={72} style={{ borderRadius: radii.md }} />
          <Skeleton width="100%" height={72} style={{ borderRadius: radii.md }} />
        </View>
      ) : recent.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="Henüz ödeme yapmadınız"
          text="Aşağıdaki ÖDEME YAP düğmesiyle bir QR okutun; fişiniz otomatik olarak burada listelenir."
          action={<Button label="Bakiye Yükle" variant="secondary" icon="wallet" onPress={onTopUp} />}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {recent.map((item) => (
            <ReceiptRow key={item.txHash} item={item} onPress={() => onOpenReceipt(item)} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE },
  header: { marginBottom: spacing.md },
  balanceCard: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...cardShadow,
  },
  balanceActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  topUpLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  summaryCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...cardShadow,
  },
  summaryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  listHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
