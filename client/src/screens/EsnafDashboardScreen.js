import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BrandMark from '../components/BrandMark.js';
import Icon from '../components/Icon.js';
import Amount from '../components/Amount.js';
import { InlineNotice, MerchantAvatar, USE_NATIVE_DRIVER } from '../components/StateViews.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { clearMerchantSession } from '../services/merchant-auth.service.js';
import { getMerchantBalance } from '../services/api.service.js';
import { shortenMiddle } from '../utils/format.js';

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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <BrandMark size={30} wordmark />
          <Pressable
            onPress={handleLogout}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Çıkış"
            style={({ pressed }) => [styles.logout, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon name="logout" size={16} color={colors.textMuted} />
            <Text style={[type.captionMedium, { color: colors.textMuted }]}>Çıkış</Text>
          </Pressable>
        </View>

        <View style={styles.identity}>
          <MerchantAvatar name={session.businessName} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={[type.h1, { color: colors.textPrimary }]} numberOfLines={1}>
              {session.businessName}
            </Text>
            <View style={styles.identityMeta}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: onChainRegistered ? colors.successBg : colors.warningBg },
                ]}
              >
                <Icon
                  name={onChainRegistered ? 'shield' : 'clock'}
                  size={13}
                  color={onChainRegistered ? colors.success : colors.warning}
                />
                <Text
                  style={[
                    type.captionMedium,
                    { color: onChainRegistered ? colors.success : colors.warning },
                  ]}
                >
                  {onChainRegistered ? 'Onaylı' : 'Beklemede'}
                </Text>
              </View>
              <Text style={[type.mono, { color: colors.textMuted }]}>{shortenMiddle(stellarAddress, 5, 5)}</Text>
            </View>
          </View>
        </View>

        {!onChainRegistered && (
          <InlineNotice tone="warning" style={{ marginTop: spacing.md }}>
            Zincir kaydınız henüz onaylanmadı. Onaylanana kadar gelen ödemeler zincirde reddedilebilir.
          </InlineNotice>
        )}

        <View style={styles.balanceCard}>
          <View style={styles.balanceHead}>
            <View style={styles.balanceIcon}>
              <Icon name="wallet" size={18} color={colors.accentStrong} />
            </View>
            <Text style={[type.micro, { color: colors.textMuted }]}>BAKİYE · ZİNCİRDEN OKUNUR</Text>
          </View>
          <Amount stroops={balance} size={38} style={{ marginTop: spacing.sm }} />
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Bakiyeyi yenile"
            hitSlop={8}
            style={({ pressed }) => [styles.refresh, { opacity: pressed ? 0.6 : 1 }]}
          >
            <SpinningIcon spinning={refreshing} />
            <Text style={[type.captionMedium, { color: colors.accent }]}>
              {refreshing ? 'Yenileniyor…' : 'Bakiyeyi yenile'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.actions}>
          <Button
            label="Ödeme Al"
            icon="qr"
            onPress={() => navigate('MerchantAmountEntry', { session, stellarAddress })}
          />
          <Button
            label="İşlem Geçmişi"
            variant="secondary"
            icon="history"
            onPress={() => navigate('MerchantHistory', { stellarAddress })}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

/** Yenile ikonu; `spinning` iken döner. */
function SpinningIcon({ spinning }) {
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
      <Icon name="refresh" size={15} color={colors.accent} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  identityMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 6, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  balanceCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...cardShadow,
  },
  balanceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  balanceIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refresh: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, alignSelf: 'flex-start' },
  actions: { marginTop: spacing.xl },
});
