import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Amount from '../Amount.js';
import Button from '../Button.js';
import Icon from '../Icon.js';
import { InlineNotice, Skeleton } from '../StateViews.js';
import { TAB_BAR_CLEARANCE } from './CustomerTabBar.js';
import { colors, radii, spacing, type, cardShadow } from '../../theme/index.js';

/**
 * Bakiye sekmesi: zincirdeki dTL bakiyesi, yenileme ve bakiye yükleme girişi.
 *
 * Bakiye HER ZAMAN zincirden okunur (backend'de ayna bir kayıt tutulmaz) —
 * kullanıcıya da bu söylenir, çünkü sistemin "biz banka gibi saklamayız"
 * ilkesinin görünür olduğu yer burasıdır.
 */
export default function CustomerBalanceTab({ stellarAddress, balance, refreshing, refreshError, onRefresh, onTopUp }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={[type.h1, { color: colors.textPrimary }]}>Bakiye</Text>

      <View style={styles.card}>
        <View style={styles.iconBubble}>
          <Icon name="wallet" size={18} color={colors.accentStrong} />
        </View>
        <Text style={[type.micro, { color: colors.textMuted, marginTop: spacing.sm }]}>BAKİYENİZ</Text>
        {balance === undefined ? (
          <Skeleton width={180} height={34} style={{ marginTop: 6 }} />
        ) : balance === null ? (
          <Text style={[type.h1, { color: colors.textMuted, marginTop: 4 }]}>Okunamadı</Text>
        ) : (
          <Amount stroops={balance} size={38} style={{ marginTop: 2 }} />
        )}

        <Button
          label={refreshing ? 'Yenileniyor…' : 'Bakiyeyi Yenile'}
          icon="refresh"
          variant="secondary"
          disabled={refreshing}
          onPress={onRefresh}
          style={{ marginTop: spacing.md }}
        />
      </View>

      <Button label="Bakiye Yükle" icon="wallet" onPress={onTopUp} style={{ marginTop: spacing.md }} />

      {balance === null ? (
        <InlineNotice tone="warning" style={{ marginTop: spacing.md }}>
          Bakiye şu an okunamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.
        </InlineNotice>
      ) : refreshError ? (
        <InlineNotice tone="warning" style={{ marginTop: spacing.md }}>
          Bakiye tazelenemedi; yukarıdaki tutar son okunan değerdir, güncel olmayabilir.
        </InlineNotice>
      ) : null}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE },
  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...cardShadow,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCardAlt,
  },
});
