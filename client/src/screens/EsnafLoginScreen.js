import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import BrandMark from '../components/BrandMark.js';
import Icon from '../components/Icon.js';
import TextField from '../components/TextField.js';
import { InlineNotice } from '../components/StateViews.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { loadMerchantSession, saveMerchantSession } from '../services/merchant-auth.service.js';
import { getMerchantBalance, loginMerchant, ApiError } from '../services/api.service.js';

export default function EsnafLoginScreen() {
  const { navigate, replace } = useNavigation();
  const [checkingSession, setCheckingSession] = useState(true);

  const [taxId, setTaxId] = useState('');
  const [password, setPassword] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const session = await loadMerchantSession();
      if (session) {
        try {
          const result = await getMerchantBalance(session.merchantId, session.apiKey);
          replace('MerchantDashboard', {
            session,
            balance: result.balance,
            stellarAddress: result.stellarAddress,
            kycStatus: result.kycStatus,
            onChainRegistered: result.onChainRegistered,
          });
          return;
        } catch {
          // Kayıtlı oturum artık geçersiz — normal giriş formunu göster.
        }
      }
      setCheckingSession(false);
    })();
  }, [replace]);

  const handleLogin = useCallback(async () => {
    setError(null);
    if (!taxId.trim() || !password) {
      setError('Vergi numarası ve şifre zorunludur.');
      return;
    }
    setLoading(true);
    try {
      const result = await loginMerchant({ taxId: taxId.trim(), password });
      const session = { merchantId: result.merchantId, apiKey: result.apiKey, businessName: result.businessName };
      await saveMerchantSession(session);
      replace('MerchantDashboard', {
        session,
        stellarAddress: result.stellarAddress,
        kycStatus: result.kycStatus,
        onChainRegistered: result.onChainRegistered,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giriş yapılamadı, tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }, [taxId, password, replace]);

  // Kayıtlı oturum sınanırken: boş bir spinner yerine ne olduğunu söyle.
  if (checkingSession) {
    return (
      <Screen>
        <View style={styles.centerFill}>
          <BrandMark size={44} />
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
          <Text style={[type.body, { color: colors.textMuted, marginTop: spacing.sm }]}>Oturum kontrol ediliyor…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Rol seçimine dönüş yolu: bu ekranda hiç yoktu, kullanıcı esnaf tarafında kalıyordu. */}
          <BackButton style={{ marginBottom: spacing.sm }} />

          <View style={styles.header}>
            <BrandMark size={48} />
            <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.md }]}>Esnaf Girişi</Text>
            <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
              Vergi numaranız ve şifrenizle giriş yapın
            </Text>
          </View>

          <View style={styles.card}>
            <TextField
              label="Vergi Numarası (VKN)"
              value={taxId}
              onChangeText={setTaxId}
              placeholder="10 haneli vergi numarası"
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={{ marginTop: spacing.md }}>
              <TextField
                label="Şifre"
                value={password}
                onChangeText={setPassword}
                placeholder="Şifreniz"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showKey}
                onSubmitEditing={handleLogin}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showKey ? 'Şifreyi gizle' : 'Şifreyi göster'}
                onPress={() => setShowKey((v) => !v)}
                hitSlop={8}
                style={styles.keyToggle}
              >
                <Icon name={showKey ? 'x' : 'shield'} size={13} color={colors.textMuted} />
                <Text style={[type.caption, { color: colors.textMuted }]}>{showKey ? 'Gizle' : 'Göster'}</Text>
              </Pressable>
            </View>
          </View>

          {error ? (
            <InlineNotice tone="danger" style={{ marginTop: spacing.md }}>
              {error}
            </InlineNotice>
          ) : null}

          <Button label="Giriş Yap" onPress={handleLogin} loading={loading} style={{ marginTop: spacing.lg }} />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={[type.caption, { color: colors.textMuted }]}>veya</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hesabın yok mu? Kayıt ol"
            onPress={() => navigate('MerchantRegister')}
            style={({ pressed }) => [styles.registerRow, pressed && { backgroundColor: colors.bgCardAlt }]}
          >
            <View style={styles.registerIcon}>
              <Icon name="store" size={18} color={colors.accentStrong} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.captionMedium, { color: colors.textPrimary }]}>Hesabın yok mu?</Text>
              <Text style={[type.caption, { color: colors.textSecondary, marginTop: 1 }]}>
                İşletmeni kaydet, hemen ödeme almaya başla
              </Text>
            </View>
            <Icon name="arrowRight" size={18} color={colors.accent} />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  card: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...cardShadow,
  },
  keyToggle: {
    position: 'absolute',
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  registerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  registerIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
