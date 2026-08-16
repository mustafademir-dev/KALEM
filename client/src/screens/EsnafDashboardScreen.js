import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { clearMerchantSession } from '../services/merchant-auth.service.js';
import { getMerchantBalance } from '../services/api.service.js';
import { formatDtl, shortenMiddle } from '../utils/format.js';

export default function EsnafDashboardScreen({ params }) {
  const { session, stellarAddress } = params;
  const [balance, setBalance] = useState(params.balance);
  const [onChainRegistered, setOnChainRegistered] = useState(params.onChainRegistered);
  const [refreshing, setRefreshing] = useState(false);
  const { navigate, reset } = useNavigation();

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await getMerchantBalance(session.merchantId, session.apiKey);
      setBalance(result.balance);
      setOnChainRegistered(result.onChainRegistered);
    } catch {
      // Sessizce yok say — ekranda son bilinen bakiye görünmeye devam eder.
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  const handleLogout = useCallback(async () => {
    await clearMerchantSession();
    reset('RoleSelect');
  }, [reset]);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[type.caption, { color: colors.textMuted }]}>{shortenMiddle(stellarAddress, 6, 6)}</Text>
          <Text style={[type.h1, { color: colors.textPrimary }]}>{session.businessName}</Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: onChainRegistered ? colors.successBg : colors.warningBg },
            ]}
          >
            <Text
              style={[
                type.captionMedium,
                { color: onChainRegistered ? colors.success : colors.warning },
              ]}
            >
              {onChainRegistered ? 'Onaylı' : 'Beklemede'}
            </Text>
          </View>
        </View>
        <Pressable onPress={handleLogout}>
          <Text style={[type.captionMedium, { color: colors.textMuted }]}>Çıkış</Text>
        </Pressable>
      </View>

      <View style={styles.balanceCard}>
        <Text style={[type.caption, { color: colors.textMuted }]}>BAKİYE (ZİNCİRDEN)</Text>
        <Text style={styles.balanceAmount}>{formatDtl(balance)}</Text>
        <Pressable onPress={handleRefresh} disabled={refreshing}>
          <Text style={[type.captionMedium, { color: colors.accent, marginTop: spacing.xs }]}>
            {refreshing ? 'Yenileniyor…' : 'Bakiyeyi Yenile'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Button
          label="Ödeme Al"
          onPress={() => navigate('MerchantAmountEntry', { session, stellarAddress })}
        />
        <Button
          label="İşlem Geçmişi"
          variant="secondary"
          onPress={() => navigate('MerchantHistory', { stellarAddress })}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.lg,
  },
  badge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  balanceCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...cardShadow,
  },
  balanceAmount: {
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 34,
    color: colors.accent,
    marginTop: 4,
  },
  actions: { padding: spacing.lg, marginTop: spacing.lg },
});
