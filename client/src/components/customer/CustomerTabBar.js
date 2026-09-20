import React from 'react';
import TabBar, { TAB_BAR_CLEARANCE } from '../TabBar.js';

/** Sekme içeriğinin alt boşluğu — müşteri sekmeleri bunu buradan alır. */
export { TAB_BAR_CLEARANCE };

const TABS = [
  { key: 'home', label: 'Ana Sayfa', icon: 'home' },
  { key: 'receipts', label: 'Fişlerim', icon: 'receipt' },
  { key: 'balance', label: 'Bakiye', icon: 'wallet' },
  { key: 'account', label: 'Hesap', icon: 'user' },
];

/**
 * Müşteri alt çubuğu: 2 sekme · ORTADA BÜYÜK "Ödeme Yap" · 2 sekme.
 *
 * Esnaf kabuğuyla AYNI yerleşimi kullanır (`components/TabBar.js`); simetri
 * kasıtlıdır — ortadaki düğme her iki rolde de o rolün en sık yaptığı iştir:
 * esnafta QR üretmek ("Ödeme Al"), müşteride QR okutmak ("Ödeme Yap").
 */
export default function CustomerTabBar({ active, onSelect, onPay }) {
  return (
    <TabBar
      tabs={TABS}
      active={active}
      onSelect={onSelect}
      onAction={onPay}
      actionIcon="scan"
      actionLabel="ÖDEME YAP"
    />
  );
}
