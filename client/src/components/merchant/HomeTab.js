import React from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon.js';
import BrandMark from '../BrandMark.js';
import { EmptyState, InlineNotice, MerchantAvatar, Skeleton, USE_NATIVE_DRIVER } from '../StateViews.js';
import { BalanceCard, DaySummaryCard, SocialFundCard } from './SummaryCards.js';
import TransactionRow from './TransactionRow.js';
import { TAB_BAR_CLEARANCE } from './MerchantTabBar.js';
import { colors, radii, spacing, type, cardShadow } from '../../theme/index.js';

/** Esnaf ana sayfası: büyük Ödeme Al, bugünkü özet, bakiye + Sosyal Fon, son işlemler. */
export default function HomeTab({
  businessName,
  stellarAddress,
  onChainRegistered,
  dashboard, // { status: 'loading'|'ready'|'error', data, slow }
  refreshing,
  onRefresh,
  onRetry,
  onPay,
  onRefund,
  onSeeAll,
  onOpenReceipt,
  balanceFallback,
}) {
  const { status, data, slow } = dashboard;
  const loading = status === 'loading' && !data;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.topBar}>
        <BrandMark size={30} wordmark />
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Yenile"
          hitSlop={10}
          style={({ pressed }) => [styles.refresh, { opacity: pressed ? 0.6 : 1 }]}
        >
          <SpinningIcon spinning={refreshing} />
        </Pressable>
      </View>

      <View style={styles.identity}>
        <MerchantAvatar name={businessName} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={[type.h1, { color: colors.textPrimary }]} numberOfLines={1}>
            {businessName}
          </Text>
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: onChainRegistered ? colors.successBg : colors.warningBg }]}>
              <Icon
                name={onChainRegistered ? 'shield' : 'clock'}
                size={13}
                color={onChainRegistered ? colors.success : colors.warning}
              />
              <Text style={[type.captionMedium, { color: onChainRegistered ? colors.success : colors.warning }]}>
                {onChainRegistered ? 'Onaylı' : 'Beklemede'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {!onChainRegistered && (
        <InlineNotice tone="warning" style={{ marginTop: spacing.md }}>
          Zincir kaydınız henüz onaylanmadı. Onaylanana kadar gelen ödemeler zincirde reddedilebilir.
        </InlineNotice>
      )}

      {/* ÖDEME AL — esnafın en sık kullandığı eylem: sayfadaki en büyük, en baskın öğe */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ödeme Al"
        onPress={onPay}
        style={({ pressed }) => [styles.payHero, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
      >
        <View style={styles.payHeroIcon}>
          <Icon name="qr" size={36} color={colors.accentStrong} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.payHeroTitle}>Ödeme Al</Text>
          <Text style={[type.body, { color: 'rgba(255,255,255,0.9)' }]}>Tutarı gir, QR'ı müşteriye göster</Text>
        </View>
        <Icon name="arrowRight" size={26} color={colors.white} />
      </Pressable>

      {onRefund ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="İade"
          onPress={onRefund}
          style={({ pressed }) => [styles.refundAction, pressed && { backgroundColor: colors.bgCardAlt }]}
        >
          <Icon name="refresh" size={20} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={[type.bodyMedium, { color: colors.textPrimary }]}>İade</Text>
            <Text style={[type.caption, { color: colors.textMuted }]}>Fiş numarasıyla ödemeyi geri ver</Text>
          </View>
          <Icon name="chevronRight" size={18} color={colors.textMuted} />
        </Pressable>
      ) : null}

      {status === 'error' && (
        <InlineNotice
          tone="danger"
          style={{ marginTop: spacing.md }}
          actionLabel="Tekrar dene"
          onAction={onRetry}
        >
          {data ? 'Veriler güncellenemedi; son bilinen değerler gösteriliyor.' : 'Ana sayfa verileri alınamadı.'}
        </InlineNotice>
      )}
      {status === 'loading' && slow && !data && (
        <InlineNotice tone="info" style={{ marginTop: spacing.md }}>
          Sunucu uyanıyor, ilk açılış birkaç saniye sürebilir…
        </InlineNotice>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <DaySummaryCard summary={data?.today} loading={loading} />
      </View>

      <View style={styles.pair}>
        <BalanceCard balance={data ? data.balance : balanceFallback} loading={loading && balanceFallback === undefined} />
        <SocialFundCard fund={data?.socialFund} loading={loading} />
      </View>

      <View style={styles.sectionHead}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>Son işlemler</Text>
        {data && data.recent.length > 0 ? (
          <Pressable onPress={onSeeAll} hitSlop={8} style={styles.seeAll}>
            <Text style={[type.captionMedium, { color: colors.accent }]}>Tümü</Text>
            <Icon name="chevronRight" size={14} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={{ gap: spacing.xs }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonRow}>
              <Skeleton width={40} height={40} style={{ borderRadius: 20 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width={110} height={16} />
                <Skeleton width={150} height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : data && data.recent.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="Henüz işlem yok"
          text="İlk ödemeni almak için Ödeme Al'a dokun. Alınan ödemeler ve fişleri burada görünecek."
        />
      ) : data ? (
        <View style={{ gap: spacing.xs }}>
          {data.recent.map((item) => (
            <TransactionRow key={item.id} item={item} onOpenReceipt={onOpenReceipt} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function SpinningIcon({ spinning }) {
  const turn = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!spinning) {
      turn.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: USE_NATIVE_DRIVER })
    );
    loop.start();
    return () => loop.stop();
  }, [spinning, turn]);

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Icon name="refresh" size={20} color={colors.textMuted} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  refundAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scroll: { padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refresh: { padding: 6 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 6, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  payHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    minHeight: 96,
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    ...cardShadow,
    shadowColor: colors.accentStrong,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  payHeroIcon: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payHeroTitle: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, lineHeight: 32, color: colors.white },
  pair: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
