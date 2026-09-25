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
import { createWallet, loadWallet, signData, bytesToBase64 } from '../services/wallet.service.js';
import { readDtlBalance } from '../services/stellar-read.service.js';
import { listReceipts, syncRefunds } from '../services/receipt-archive.service.js';
import { getMyRefunds } from '../services/api.service.js';
import { buildCustomerRefundsChallenge } from '../utils/faucetChallenge.js';
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
/**
 * Esnafın yaptığı iadeleri sunucudan (imzalı) alıp cihazdaki arşive işler.
 * Best-effort: hata olursa `null` döner, ekran etkilenmez.
 */
async function checkRefunds(address) {
  try {
    const timestamp = Date.now();
    const challenge = buildCustomerRefundsChallenge(address, timestamp);
    const signature = bytesToBase64(await signData(Buffer.from(challenge, 'utf8')));
    const { refunds } = await getMyRefunds({ address, timestamp, signature });
    return await syncRefunds(address, refunds ?? []);
  } catch {
    return null;
  }
}

export default function CustomerDashboardScreen() {
  const { navigate, reset } = useNavigation();
  const [tab, setTab] = useState('home');
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(undefined); // undefined = yükleniyor, null = alınamadı
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [archive, setArchive] = useState({ loading: true, items: [] });
  const [newRefunds, setNewRefunds] = useState([]);

  const applyRefundCheck = useCallback(async (address) => {
    const result = await checkRefunds(address);
    if (!result) return;
    setArchive({ loading: false, items: result.items });
    if (result.newly.length > 0) setNewRefunds((prev) => [...result.newly, ...prev]);
  }, []);

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

      applyRefundCheck(w.stellarAddress);
    })();
  }, [applyRefundCheck]);

  const handleRefresh = useCallback(async () => {
    if (!wallet) return;
    setRefreshing(true);
    setRefreshError(false);
    applyRefundCheck(wallet.stellarAddress);
    try {
      const bal = await readDtlBalance(wallet.stellarAddress);
      setBalance(bal);
    } catch {
      // Son bilinen bakiye ekranda KALIR (silmek yanıltıcı olurdu), ama hata
      // artık sessizce yutulmaz: kullanıcı gördüğü rakamın tazelenmediğini bilmeli.
      setRefreshError(true);
    } finally {
      setRefreshing(false);
    }
  }, [wallet, applyRefundCheck]);

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
              refreshError={refreshError}
              onRefresh={handleRefresh}
              receipts={archive.items}
              summary={summary}
              loading={archive.loading}
              onSeeAll={() => setTab('receipts')}
              onOpenReceipt={handleOpenReceipt}
              onTopUp={handleTopUp}
              newRefunds={newRefunds}
              onDismissRefunds={() => setNewRefunds([])}
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
              refreshError={refreshError}
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
