import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from '../Icon.js';
import Amount from '../Amount.js';
import { Skeleton } from '../StateViews.js';
import { colors, radii, spacing, type, cardShadow } from '../../theme/index.js';
import { formatTl } from '../../utils/format.js';
import { formatTrDate } from '../../utils/dates.js';

/** Bir günün özeti: toplam alınan, komisyon, net, işlem sayısı. `summary` = API'nin `today`/`summary` nesnesi. */
export function DaySummaryCard({ title = 'Bugünkü Özet', summary, loading }) {
  const noBreakdown = summary && summary.count > 0 && summary.breakdownCount === 0;

  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>{title}</Text>
        {summary?.date ? (
          <Text style={[type.caption, { color: colors.textMuted }]}>{formatTrDate(summary.date)}</Text>
        ) : null}
      </View>

      <Text style={[type.micro, { color: colors.textMuted, marginTop: spacing.md }]}>TOPLAM ALINAN</Text>
      {loading ? (
        <Skeleton width={180} height={34} style={{ marginTop: 6 }} />
      ) : summary ? (
        <Amount stroops={summary.gross} size={38} style={{ marginTop: 2 }} />
      ) : (
        <Text style={[type.display, { color: colors.textMuted, marginTop: 2 }]}>—</Text>
      )}

      <View style={styles.statsRow}>
        <Stat label="KOMİSYON" loading={loading} value={!summary ? undefined : noBreakdown ? null : summary.commission} />
        <View style={styles.statDivider} />
        <Stat label="NET KAZANÇ" loading={loading} value={!summary ? undefined : noBreakdown ? null : summary.net} accent />
      </View>

      {!loading && summary ? (
        <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
          {summary.count === 0 ? 'Bu tarihte henüz işlem yok' : `${summary.count} işlem`}
          {summary.count > 0 && summary.missingBreakdownCount > 0
            ? ` · ${summary.missingBreakdownCount} işlemde komisyon verisi yok`
            : ''}
        </Text>
      ) : null}
    </View>
  );
}

function Stat({ label, value, loading, accent }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[type.micro, { color: colors.textMuted }]}>{label}</Text>
      {loading ? (
        <Skeleton width={88} height={18} style={{ marginTop: 6 }} />
      ) : value === undefined ? (
        <Text style={[type.h2, { color: colors.textMuted, marginTop: 2 }]}>—</Text>
      ) : value === null ? (
        <Text style={[type.bodyMedium, { color: colors.textMuted, marginTop: 2 }]}>veri yok</Text>
      ) : (
        <Text style={[type.h2, { color: accent ? colors.success : colors.textPrimary, marginTop: 2 }]}>{formatTl(value)}</Text>
      )}
    </View>
  );
}

/** Esnafın zincirdeki bakiyesi. */
export function BalanceCard({ balance, loading }) {
  return (
    <View style={[styles.card, styles.half]}>
      <View style={styles.iconBubble}>
        <Icon name="wallet" size={18} color={colors.accentStrong} />
      </View>
      <Text style={[type.micro, styles.cardLabel]}>BAKİYE</Text>
      {loading ? (
        <Skeleton width={90} height={22} style={{ marginTop: 6 }} />
      ) : balance === null || balance === undefined ? (
        <Text style={[type.bodyMedium, { color: colors.textMuted, marginTop: 4 }]}>okunamadı</Text>
      ) : (
        <Amount stroops={balance} size={22} style={{ marginTop: 2 }} />
      )}
      <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>Zincirden okunur</Text>
    </View>
  );
}

/**
 * Sosyal Fon: esnafın kendi işlemlerinden fona giden pay (dürüst anlatım: "katkınız") ve
 * fonun zincirdeki toplam bakiyesi. Fondan yapılan bir DAĞITIM olduğu iddia EDİLMEZ —
 * sistemde şu an yalnızca birikim vardır.
 */
export function SocialFundCard({ fund, loading }) {
  return (
    <View style={[styles.card, styles.half, { borderColor: '#F3D9DD' }]}>
      <View style={[styles.iconBubble, { backgroundColor: '#FBEAEE' }]}>
        <Icon name="heart" size={18} color="#C0395B" />
      </View>
      <Text style={[type.micro, styles.cardLabel]}>SOSYAL FON'A KATKINIZ</Text>
      {loading ? (
        <Skeleton width={90} height={22} style={{ marginTop: 6 }} />
      ) : fund ? (
        <Amount stroops={fund.yourContribution} size={22} color="#C0395B" style={{ marginTop: 2 }} />
      ) : (
        <Text style={[type.h2, { color: colors.textMuted, marginTop: 2 }]}>—</Text>
      )}
      <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={2}>
        {!loading && fund && fund.total !== null && fund.total !== undefined
          ? `Fonun toplamı: ${formatTl(fund.total)}`
          : 'Her satışın %0,1\'i fona aktarılır'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...cardShadow,
  },
  half: { flex: 1, padding: spacing.md },
  // İki kartın etiketi farklı satır sayısında olsa da tutarlar aynı hizada başlasın.
  cardLabel: { color: colors.textMuted, marginTop: spacing.sm, minHeight: 28 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
