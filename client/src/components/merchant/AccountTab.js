import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '../Button.js';
import Icon from '../Icon.js';
import { MerchantAvatar } from '../StateViews.js';
import TechnicalDetails from '../TechnicalDetails.js';
import { TAB_BAR_CLEARANCE } from './MerchantTabBar.js';
import { colors, radii, spacing, type } from '../../theme/index.js';
import { shortenMiddle } from '../../utils/format.js';

/** Hesap: işletme bilgileri, zincir onay durumu ve çıkış. */
export default function AccountTab({ session, stellarAddress, onChainRegistered, onDepartments, onLogout }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <MerchantAvatar name={session.businessName} size={72} />
        <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.sm, textAlign: 'center' }]}>
          {session.businessName}
        </Text>
        <View style={[styles.badge, { backgroundColor: onChainRegistered ? colors.successBg : colors.warningBg }]}>
          <Icon
            name={onChainRegistered ? 'shield' : 'clock'}
            size={14}
            color={onChainRegistered ? colors.success : colors.warning}
          />
          <Text style={[type.captionMedium, { color: onChainRegistered ? colors.success : colors.warning }]}>
            {onChainRegistered ? 'Zincirde onaylı' : 'Zincir onayı bekleniyor'}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Row label="İşyeri No" value={shortenMiddle(session.merchantId, 6, 6)} mono />
      </View>

      <TechnicalDetails
        style={{ marginTop: spacing.md }}
        rows={[
          { label: 'İşyeri No (tam)', value: session.merchantId, mono: true },
          { label: 'Zincir adresi', value: stellarAddress, mono: true },
          { label: 'Ağ', value: 'Stellar' },
        ]}
      />

      {onDepartments ? (
        <Button
          label="Departmanlar (KDV)"
          variant="secondary"
          icon="receipt"
          onPress={onDepartments}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      <Button
        label="Çıkış Yap"
        variant="secondary"
        icon="logout"
        onPress={onLogout}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>
  );
}

function Row({ label, value, mono }) {
  return (
    <View style={styles.row}>
      <Text style={[type.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[mono ? type.mono : type.captionMedium, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE },
  hero: { alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.lg },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  hairline: { height: 1, backgroundColor: colors.border },
});
