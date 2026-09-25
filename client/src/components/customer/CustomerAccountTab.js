import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '../Button.js';
import Icon from '../Icon.js';
import TechnicalDetails from '../TechnicalDetails.js';
import { TAB_BAR_CLEARANCE } from './CustomerTabBar.js';
import { colors, radii, spacing, type } from '../../theme/index.js';

/**
 * Hesap: cüzdan bilgileri, ağ ve çıkış.
 *
 * Buradaki ifadeler KODLA doğrulanabilir olanlarla sınırlıdır: gizli anahtar
 * cihazda üretilir/saklanır ve imzalama cihazda yapılır (wallet.service.js),
 * sunucuya yalnızca imzalı zarf gider. Web hedefinde deponun ŞİFRELENMEMİŞ
 * olduğu (docs §6.5) göz ardı edilip "güvende" gibi bir iddiada BULUNULMAZ.
 */
export default function CustomerAccountTab({ stellarAddress, receiptCount, onLogout }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Icon name="user" size={32} color={colors.accentStrong} />
        </View>
        <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.sm }]}>Hesabım</Text>
      </View>

      <View style={styles.card}>
        <Row label="Kayıtlı fiş" value={`${receiptCount} adet`} />
      </View>

      <TechnicalDetails
        style={{ marginTop: spacing.md }}
        rows={[
          { label: 'Cüzdan adresi', value: stellarAddress, mono: true },
          { label: 'Ağ', value: 'Stellar' },
        ]}
      />

      <View style={styles.noteCard}>
        <Icon name="shield" size={16} color={colors.textMuted} />
        <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>
          Gizli anahtarınız bu cihazda oluşturulur ve burada saklanır; ödemeler cihazınızda imzalanır, anahtar sunucuya
          gönderilmez.
        </Text>
      </View>

      {/* Yalnızca rol seçimine döner; cüzdan (anahtar) ve fiş arşivi cihazda KALIR, silinmez. */}
      <Button label="Çıkış Yap" variant="secondary" icon="logout" onPress={onLogout} style={{ marginTop: spacing.lg }} />
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
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  hairline: { height: 1, backgroundColor: colors.border },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgCardAlt,
  },
});
