import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import CustomerTabBar from '../components/customer/CustomerTabBar.js';
import CustomerHomeTab from '../components/customer/CustomerHomeTab.js';
import CustomerReceiptsTab from '../components/customer/CustomerReceiptsTab.js';
import CustomerBalanceTab from '../components/customer/CustomerBalanceTab.js';
import CustomerAccountTab from '../components/customer/CustomerAccountTab.js';
import { colors, spacing, type } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { createWallet, loadWallet } from '../services/wallet.service.js';
import { readDtlBalance } from '../services/stellar-read.service.js';
import { listReceipts } from '../services/receipt-archive.service.js';
import { summarizeArchive } from '../utils/receiptArchive.js';

/**
 * Müşteri kabuğu — esnaf kabuğuyla (`EsnafDashboardScreen`) simetrik: 4 sekme +
 * ortada yükseltilmiş büyük eylem düğmesi.
 *
 * Veri kaynakları:
 * - Bakiye: doğrudan zincirden (`readDtlBalance`), sunucuda ayna kayıt yok.
 * - İşlem geçmişi/özet: CİHAZDAKİ fiş arşivi (bkz. utils/receiptArchive.js) —
 *   sunucuda müşteri bazlı liste ucu bilinçli olarak AÇILMADI.
 *
 * Not: Navigator aynı anda tek ekran render ettiği için, ödeme/fiş ekranından
 * dönüldüğünde bu ekran yeniden kurulur ve arşiv kendiliğinden tazelenir —
 * ayrıca bir yenileme mekanizması gerekmez.
 */
export default function CustomerDashboardScreen() {
  const { navigate, reset } = useNavigation();
  const [tab, setTab] = useState('home');
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(undefined); // undefined = yükleniyor, null = alınamadı
  const [refreshing, setRefreshing] = useState(false);
  const [archive, setArchive] = useState({ loading: true, items: [] });

  useEffect(() => {
    (async () => {
      let w = await loadWallet();
      if (!w) w = await createWallet();
      setWallet(w);

      // Arşiv cihazdan okunur — bakiyeyi beklemez, zincir yavaşsa liste yine de gelir.
      setArchive({ loading: false, items: await listReceipts(w.stellarAddress) });

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

  const summary = useMemo(() => summarizeArchive(archive.items), [archive.items]);

  const handleTopUp = useCallback(
    () => navigate('CustomerTopUp', { stellarAddress: wallet.stellarAddress }),
    [navigate, wallet]
  );

  const handleOpenReceipt = useCallback(
    (item) =>
      navigate('CustomerReceipt', {
        txHash: item.txHash,
        totalAmount: item.totalAmount,
        businessName: item.businessName,
        paidAt: item.paidAt,
        senderAddress: wallet.stellarAddress,
      }),
    [navigate, wallet]
  );

  if (!wallet) {
    return (
      <Screen>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.body, { color: colors.textMuted, marginTop: spacing.sm }]}>Cüzdan hazırlanıyor…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {tab === 'home' && (
            <CustomerHomeTab
              stellarAddress={wallet.stellarAddress}
              balance={balance}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              receipts={archive.items}
              summary={summary}
              loading={archive.loading}
              onSeeAll={() => setTab('receipts')}
              onOpenReceipt={handleOpenReceipt}
              onTopUp={handleTopUp}
            />
          )}
          {tab === 'receipts' && (
            <CustomerReceiptsTab
              receipts={archive.items}
              loading={archive.loading}
              onOpenReceipt={handleOpenReceipt}
            />
          )}
          {tab === 'balance' && (
            <CustomerBalanceTab
              stellarAddress={wallet.stellarAddress}
              balance={balance}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              onTopUp={handleTopUp}
            />
          )}
          {tab === 'account' && (
            <CustomerAccountTab
              stellarAddress={wallet.stellarAddress}
              receiptCount={archive.items.length}
              onLogout={() => reset('RoleSelect')}
            />
          )}
        </View>

        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
          <CustomerTabBar active={tab} onSelect={setTab} onPay={() => navigate('CustomerPayment')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
