import React from 'react';
import TabBar, { TAB_BAR_CLEARANCE } from '../TabBar.js';

/** Sekme içeriğinin alt boşluğu — sekme dosyaları bunu buradan almaya devam eder. */
export { TAB_BAR_CLEARANCE };

const TABS = [
  { key: 'home', label: 'Ana Sayfa', icon: 'home' },
  { key: 'invoices', label: 'Faturalarım', icon: 'receipt' },
  { key: 'report', label: 'Gün Sonu', icon: 'calendar' },
  { key: 'account', label: 'Hesap', icon: 'user' },
];

/**
 * Esnaf alt çubuğu: 2 sekme · ORTADA BÜYÜK "Ödeme Al" · 2 sekme.
 * Yerleşim/ölçüler ortak `components/TabBar.js`'tedir (müşteri kabuğu da onu kullanır);
 * burada yalnızca esnafa özgü sekmeler ve ortadaki eylem tanımlanır.
 */
export default function MerchantTabBar({ active, onSelect, onPay }) {
  return (
    <TabBar
      tabs={TABS}
      active={active}
      onSelect={onSelect}
      onAction={onPay}
      actionIcon="qr"
      actionLabel="ÖDEME AL"
    />
  );
}
