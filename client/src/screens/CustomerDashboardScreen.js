import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { createWallet, loadWallet } from '../services/wallet.service.js';
import { readDtlBalance } from '../services/stellar-read.service.js';
import { formatDtl, shortenMiddle } from '../utils/format.js';

export default function CustomerDashboardScreen() {
  const { navigate } = useNavigation();
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(undefined); // undefined = yükleniyor, null = alınamadı
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      let w = await loadWallet();
      if (!w) w = await createWallet();
      setWallet(w);
      try {
        const bal = await readDtlBalance(w.stellarAddress);
        setBalance(bal);
      } catch {
        setBalance(null);
      }
    })();
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!wallet) return;
    setRefreshing(true);
    try {
      const bal = await readDtlBalance(wallet.stellarAddress);
      setBalance(bal);
    } catch {
      // Sessizce yok say — son bilinen bakiye görünmeye devam eder.
    } finally {
      setRefreshing(false);
    }
  }, [wallet]);

  if (!wallet) {
    return (
      <Screen>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.body, { color: colors.textMuted, marginTop: spacing.sm }]}>
            Cüzdan hazırlanıyor…
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[type.caption, { color: colors.textMuted }]}>{shortenMiddle(wallet.stellarAddress, 6, 6)}</Text>
        <Text style={[type.h1, { color: colors.textPrimary }]}>Cüzdanım</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={[type.caption, { color: colors.textMuted }]}>BAKİYE (ZİNCİRDEN)</Text>
        <Text style={styles.balanceAmount}>
          {balance === undefined ? '···' : balance === null ? 'Alınamadı' : formatDtl(balance).replace(' dTL', '')}
          <Text style={styles.balanceUnit}> dTL</Text>
        </Text>
        <Pressable onPress={handleRefresh} disabled={refreshing}>
          <Text style={[type.captionMedium, { color: colors.accent, marginTop: spacing.xs }]}>
            {refreshing ? 'Yenileniyor…' : 'Bakiyeyi Yenile'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Button label="Ödeme Yap" onPress={() => navigate('CustomerPayment')} />
        <Button
          label="Bakiye Yükle"
          variant="secondary"
          onPress={() => navigate('CustomerTopUp', { stellarAddress: wallet.stellarAddress })}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.lg },
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
  balanceUnit: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.accent,
  },
  actions: { padding: spacing.lg, marginTop: spacing.lg },
});
