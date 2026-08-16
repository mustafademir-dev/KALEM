import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import TextField from '../components/TextField.js';
import { colors, spacing, type } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { loadMerchantSession, saveMerchantSession } from '../services/merchant-auth.service.js';
import { getMerchantBalance, ApiError } from '../services/api.service.js';

export default function EsnafLoginScreen() {
  const { navigate, replace } = useNavigation();
  const [checkingSession, setCheckingSession] = useState(true);

  const [merchantId, setMerchantId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [businessName, setBusinessName] = useState('');
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
    if (!merchantId.trim() || !apiKey.trim()) {
      setError('İşyeri ID ve API anahtarı zorunludur.');
      return;
    }
    setLoading(true);
    try {
      const result = await getMerchantBalance(merchantId.trim(), apiKey.trim());
      const session = {
        merchantId: merchantId.trim(),
        apiKey: apiKey.trim(),
        businessName: businessName.trim() || 'İşletmem',
      };
      await saveMerchantSession(session);
      navigate('MerchantDashboard', {
        session,
        balance: result.balance,
        stellarAddress: result.stellarAddress,
        kycStatus: result.kycStatus,
        onChainRegistered: result.onChainRegistered,
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError('API anahtarı veya işyeri ID hatalı.');
      } else if (err instanceof ApiError && err.code === 'NETWORK_ERROR') {
        setError(err.message);
      } else {
        setError('Giriş yapılamadı — bilgileri kontrol edin.');
      }
    } finally {
      setLoading(false);
    }
  }, [merchantId, apiKey, businessName, navigate]);

  if (checkingSession) {
    return (
      <Screen>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[type.h1, { color: colors.textPrimary }]}>Esnaf Girişi</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg }]}>
          Kayıt sırasında size verilen işyeri ID ve API anahtarını girin
        </Text>

        <TextField
          label="İşyeri ID"
          value={merchantId}
          onChangeText={setMerchantId}
          placeholder="66f1a2b3c4d5e6f7a8b9c0d1"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ marginBottom: spacing.md }}
        />
        <TextField
          label="API Anahtarı"
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="64 karakterlik anahtar"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{ marginBottom: spacing.md }}
        />
        <TextField
          label="İşletme Adı (görünen ad, isteğe bağlı)"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Kalem Kırtasiye"
          style={{ marginBottom: spacing.lg }}
        />

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={[type.captionMedium, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        <Button label="Giriş Yap" onPress={handleLogin} loading={loading} />

        <Text
          style={[type.captionMedium, { color: colors.accent, textAlign: 'center', marginTop: spacing.lg }]}
          onPress={() => navigate('MerchantRegister')}
        >
          Hesabın yok mu? Kayıt Ol
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingTop: spacing.xl },
  errorBanner: {
    padding: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.dangerBg,
    marginBottom: spacing.md,
  },
});
