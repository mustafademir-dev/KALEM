import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Screen from '../components/Screen.js';
import BrandMark from '../components/BrandMark.js';
import Icon from '../components/Icon.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';

// Stantta ekranı gören herkes kendi telefonuyla denesin diye uygulamanın açık adresi.
const APP_URL = process.env.EXPO_PUBLIC_APP_URL || 'https://kalem-app.onrender.com';

export default function RoleSelectScreen() {
  const { navigate } = useNavigation();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap}>
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

        <View style={styles.tryCard} accessibilityLabel={`Kendi telefonunuzda deneyin: ${APP_URL}`}>
          <View style={styles.qrBox}>
            <QRCode value={APP_URL} size={104} backgroundColor={colors.white} color={colors.textPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.h2, { color: colors.textPrimary }]}>Kendi telefonunuzda deneyin</Text>
            <Text style={[type.caption, { color: colors.textSecondary, marginTop: 4 }]}>
              Kameranızla okutun, uygulama tarayıcıda açılsın. Kurulum gerekmez.
            </Text>
            <Text style={[type.mono, { color: colors.textMuted, marginTop: spacing.xs }]} selectable>
              {APP_URL.replace(/^https?:\/\//, '')}
            </Text>
          </View>
        </View>
      </ScrollView>
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
  wrap: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
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
  tryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgCardAlt,
  },
  qrBox: { padding: 8, borderRadius: radii.md, backgroundColor: colors.white },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
