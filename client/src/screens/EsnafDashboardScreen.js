import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Screen from '../components/Screen.js';
import MerchantTabBar from '../components/merchant/MerchantTabBar.js';
import HomeTab from '../components/merchant/HomeTab.js';
import InvoicesTab from '../components/merchant/InvoicesTab.js';
import ReportTab from '../components/merchant/ReportTab.js';
import AccountTab from '../components/merchant/AccountTab.js';
import { useNavigation } from '../navigation/Navigator.js';
import { clearMerchantSession } from '../services/merchant-auth.service.js';
import { getMerchantDashboard } from '../services/api.service.js';

/** Ödeme ekranından dönüldüğünde (ekran yeniden kurulur) kaldığı sekmeye dönülsün. */
let lastTab = 'home';

const SLOW_HINT_MS = 6000;

/**
 * Esnaf kabuğu: alt çubuk + sekmeler (Ana Sayfa, Faturalarım, Gün Sonu, Hesap) ve ortada
 * büyük Ödeme Al. Rota adı (`MerchantDashboard`) ve parametreleri eskisiyle AYNIDIR —
 * giriş/kayıt akışları değişmedi.
 */
export default function EsnafDashboardScreen({ params }) {
  const { session, stellarAddress } = params;
  const { navigate, reset } = useNavigation();

  const [tab, setTab] = useState(lastTab);
  const [dashboard, setDashboard] = useState({ status: 'loading', data: null, slow: false });
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    lastTab = tab;
  }, [tab]);

  const loadDashboard = useCallback(
    async ({ manual = false } = {}) => {
      if (manual) setRefreshing(true);
      setDashboard((d) => ({ ...d, status: d.data ? 'ready' : 'loading', slow: false }));
      // Ücretsiz planda servis uykudaysa ilk istek ~50 sn sürer: kullanıcıya nedenini söyle.
      const slowTimer = setTimeout(() => {
        if (aliveRef.current) setDashboard((d) => ({ ...d, slow: true }));
      }, SLOW_HINT_MS);
      try {
        const data = await getMerchantDashboard(session.merchantId, session.apiKey);
        if (aliveRef.current) setDashboard({ status: 'ready', data, slow: false });
      } catch {
        if (aliveRef.current) setDashboard((d) => ({ ...d, status: 'error', slow: false }));
      } finally {
        clearTimeout(slowTimer);
        if (aliveRef.current) setRefreshing(false);
      }
    },
    [session]
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handlePay = useCallback(
    () => navigate('MerchantAmountEntry', { session, stellarAddress }),
    [navigate, session, stellarAddress]
  );

  const handleOpenReceipt = useCallback(
    (item) =>
      navigate('MerchantReceipt', {
        session,
        txHash: item.txHash,
        totalAmount: item.totalAmount,
        refunded: item.refunded,
      }),
    [navigate, session]
  );

  const handleRefund = useCallback(() => navigate('MerchantRefund', { session }), [navigate, session]);

  const handleLogout = useCallback(async () => {
    await clearMerchantSession();
    reset('RoleSelect');
  }, [reset]);

  const onChainRegistered = dashboard.data?.merchant?.onChainRegistered ?? params.onChainRegistered;

  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
        {tab === 'home' && (
          <HomeTab
            businessName={session.businessName}
            stellarAddress={stellarAddress}
            onChainRegistered={onChainRegistered}
            dashboard={dashboard}
            refreshing={refreshing}
            onRefresh={() => loadDashboard({ manual: true })}
            onRetry={() => loadDashboard()}
            onPay={handlePay}
            onRefund={handleRefund}
            onSeeAll={() => setTab('invoices')}
            onOpenReceipt={handleOpenReceipt}
            balanceFallback={params.balance}
          />
        )}
        {tab === 'invoices' && <InvoicesTab session={session} onOpenReceipt={handleOpenReceipt} />}
        {tab === 'report' && <ReportTab session={session} />}
        {tab === 'account' && (
          <AccountTab
            session={session}
            stellarAddress={stellarAddress}
            onChainRegistered={onChainRegistered}
            onLogout={handleLogout}
          />
        )}
        </View>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
          <MerchantTabBar active={tab} onSelect={setTab} onPay={handlePay} />
        </View>
      </View>
    </Screen>
  );
}
