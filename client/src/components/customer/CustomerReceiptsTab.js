import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import ReceiptRow from './ReceiptRow.js';
import { EmptyState, InlineNotice, Skeleton } from '../StateViews.js';
import { TAB_BAR_CLEARANCE } from './CustomerTabBar.js';
import { colors, radii, spacing, type } from '../../theme/index.js';

/**
 * Fişlerim: müşterinin ödediği işlemlerin fiş arşivi.
 *
 * Liste bu CİHAZDA tutulur; fişin içeriği açılırken sunucudan taze alınır.
 * Kullanıcıya bu durum ekranda dürüstçe söylenir — "bulutta saklanıyor"
 * izlenimi verilmemeli.
 */
export default function CustomerReceiptsTab({ receipts, loading, onOpenReceipt }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={[type.h1, { color: colors.textPrimary }]}>Fişlerim</Text>
      <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
        Yaptığınız ödemelerin fişleri
      </Text>

      {loading && (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <Skeleton width="100%" height={72} style={{ borderRadius: radii.md }} />
          <Skeleton width="100%" height={72} style={{ borderRadius: radii.md }} />
          <Skeleton width="100%" height={72} style={{ borderRadius: radii.md }} />
        </View>
      )}

      {!loading && receipts.length === 0 && (
        <View style={{ marginTop: spacing.xl }}>
          <EmptyState
            icon="receipt"
            title="Henüz fişiniz yok"
            text="Yaptığınız her ödemenin fişi otomatik olarak burada listelenir."
          />
        </View>
      )}

      {!loading && receipts.length > 0 && (
        <>
          <InlineNotice tone="info" icon="info" style={{ marginTop: spacing.md }}>
            Fiş listeniz bu cihazda saklanır. Uygulama verisini silerseniz veya başka bir cihaza geçerseniz liste
            sıfırlanır.
          </InlineNotice>

          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {receipts.map((item) => (
              <ReceiptRow key={item.txHash} item={item} onPress={() => onOpenReceipt(item)} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE },
});
