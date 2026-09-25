import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import BrandMark from '../components/BrandMark.js';
import Icon from '../components/Icon.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';

export default function RoleSelectScreen() {
  const { navigate } = useNavigation();

  return (
    <Screen>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <BrandMark size={56} />
          <Text style={[type.display, styles.title, { color: colors.textPrimary }]}>KALEM</Text>
          <Text style={[type.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            Devam etmek için bir rol seçin
          </Text>
        </View>

        <View style={styles.cards}>
          <RoleCard
            icon="wallet"
            title="Müşteri"
            description="Bakiye yükle, QR okutarak TL ile ödeme yap"
            onPress={() => navigate('CustomerAuth')}
          />
          <RoleCard
            icon="store"
            title="Esnaf"
            description="Ödeme al, bakiye ve işlem geçmişini gör"
            onPress={() => navigate('MerchantLogin')}
          />
        </View>
      </View>
    </Screen>
  );
}

function RoleCard({ icon, title, description, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${description}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && { borderColor: colors.accent, backgroundColor: colors.bgCardAlt },
      ]}
    >
      <View style={styles.iconWrap}>
        <Icon name={icon} size={24} color={colors.accentStrong} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.h2, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[type.caption, { color: colors.textSecondary, marginTop: 2 }]}>{description}</Text>
      </View>
      <Icon name="arrowRight" size={20} color={colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  header: { marginBottom: spacing.xl },
  title: { marginTop: spacing.md },
  cards: { gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    ...cardShadow,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
