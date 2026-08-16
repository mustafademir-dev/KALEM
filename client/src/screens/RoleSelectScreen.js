import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';

export default function RoleSelectScreen() {
  const { navigate } = useNavigation();

  return (
    <Screen>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={[type.display, { color: colors.textPrimary }]}>KALEM</Text>
          <Text style={[type.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
            Devam etmek için bir rol seçin
          </Text>
        </View>

        <View style={styles.cards}>
          <RoleCard
            title="Müşteri"
            description="Bakiye yükle, QR okutarak dTL ile ödeme yap"
            onPress={() => navigate('CustomerDashboard')}
          />
          <RoleCard
            title="Esnaf"
            description="Ödeme al, bakiye ve işlem geçmişini gör"
            onPress={() => navigate('MerchantLogin')}
          />
        </View>
      </View>
    </Screen>
  );
}

function RoleCard({ title, description, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { borderColor: colors.accent }]}
    >
      <Text style={[type.h1, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>{description}</Text>
      <Text style={[type.captionMedium, { color: colors.accent, marginTop: spacing.md }]}>Devam et →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  header: { marginBottom: spacing.xl },
  cards: { gap: spacing.md },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    ...cardShadow,
  },
});
