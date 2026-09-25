import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import BrandMark from '../components/BrandMark.js';
import TextField from '../components/TextField.js';
import { InlineNotice } from '../components/StateViews.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import storage from '../utils/storage.js';
import { createWallet, loadWallet, signData, bytesToBase64 } from '../services/wallet.service.js';
import { registerCustomer, loginCustomer, ApiError } from '../services/api.service.js';
import { buildCustomerAuthChallenge } from '../utils/faucetChallenge.js';

/** Bu cihazda en son giriş yapan müşterinin TC'si (yalnızca PIN'le hızlı giriş için, cihazda). */
const PROFILE_KEY = 'kalem_customer_tc_v1';

const maskTc = (tc) => `${'•'.repeat(7)}${String(tc).slice(-4)}`;

/**
 * Müşteri girişi — banka uygulamaları gibi:
 * - Bu cihazda daha önce giriş yapıldıysa yalnızca 6 haneli PIN sorulur.
 * - Yoksa "Giriş Yap" (TC + PIN) ya da "Hesap Aç" (TC + PIN + PIN tekrar).
 *
 * Cüzdan anahtarı cihazda üretilir/saklanır; sunucuya yalnızca adres ve imza gider.
 * Yeni bir cihazdan giriş yapılırsa eski cüzdandaki bakiye bu cihaza taşınır.
 */
export default function CustomerAuthScreen() {
  const { reset } = useNavigation();
  const [savedTc, setSavedTc] = useState(undefined); // undefined = okunuyor
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [tc, setTc] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setSavedTc((await storage.getItemAsync(PROFILE_KEY)) || null);
      } catch {
        setSavedTc(null);
      }
    })();
  }, []);

  const quickLogin = Boolean(savedTc) && mode === 'login';

  const submit = useCallback(async () => {
    setError(null);
    const idNo = quickLogin ? savedTc : tc.trim();
    if (!/^\d{11}$/.test(idNo)) return setError('TC kimlik numarası 11 haneli olmalıdır.');
    if (!/^\d{6}$/.test(pin)) return setError('PIN 6 haneli olmalıdır.');
    if (mode === 'register' && pin !== pin2) return setError('PIN\'ler aynı değil.');

    setLoading(true);
    try {
      let wallet = await loadWallet();
      if (!wallet) wallet = await createWallet();
      const timestamp = Date.now();
      const challenge = buildCustomerAuthChallenge(wallet.stellarAddress, timestamp);
      const signature = bytesToBase64(await signData(Buffer.from(challenge, 'utf8')));
      const body = { tc: idNo, pin, address: wallet.stellarAddress, timestamp, signature };

      const result = mode === 'register' ? await registerCustomer(body) : await loginCustomer(body);
      try {
        await storage.setItemAsync(PROFILE_KEY, idNo);
      } catch {
        // Hatırlanmasa da giriş geçerli; bir sonraki açılışta TC tekrar sorulur.
      }
      reset('CustomerDashboard', { migratedAmount: result.migratedAmount ?? null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İşlem tamamlanamadı, tekrar deneyin.');
      setPin('');
      setPin2('');
    } finally {
      setLoading(false);
    }
  }, [quickLogin, savedTc, tc, pin, pin2, mode, reset]);

  const switchAccount = useCallback(async () => {
    try {
      await storage.deleteItemAsync(PROFILE_KEY);
    } catch {
      // yok say
    }
    setSavedTc(null);
    setPin('');
    setError(null);
  }, []);

  if (savedTc === undefined) {
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <BackButton style={{ marginBottom: spacing.sm }} />

          <View style={styles.header}>
            <BrandMark size={48} />
            <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.md }]}>
              {quickLogin ? 'Hoş geldiniz' : mode === 'register' ? 'Hesap Aç' : 'Giriş Yap'}
            </Text>
            <Text style={[type.body, { color: colors.textSecondary, marginTop: 4, textAlign: 'center' }]}>
              {quickLogin
                ? `${maskTc(savedTc)} · PIN'inizi girin`
                : mode === 'register'
                  ? 'TC kimlik numaranız ve belirleyeceğiniz 6 haneli PIN ile'
                  : 'TC kimlik numaranız ve 6 haneli PIN\'inizle'}
            </Text>
          </View>

          {!quickLogin && (
            <View style={styles.segment}>
              {[
                ['login', 'Giriş Yap'],
                ['register', 'Hesap Aç'],
              ].map(([key, label]) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    setMode(key);
                    setError(null);
                  }}
                  style={[styles.segmentItem, mode === key && styles.segmentActive]}
                >
                  <Text style={[type.captionMedium, { color: mode === key ? colors.textPrimary : colors.textMuted }]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.card}>
            {!quickLogin && (
              <TextField
                label="TC Kimlik No"
                value={tc}
                onChangeText={(v) => setTc(v.replace(/\D/g, '').slice(0, 11))}
                placeholder="11 haneli"
                keyboardType="number-pad"
                maxLength={11}
                style={{ marginBottom: spacing.md }}
              />
            )}
            <TextField
              label="PIN"
              value={pin}
              onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 haneli"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              onSubmitEditing={mode === 'register' ? undefined : submit}
            />
            {mode === 'register' && !quickLogin && (
              <TextField
                label="PIN (tekrar)"
                value={pin2}
                onChangeText={(v) => setPin2(v.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 haneli"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                style={{ marginTop: spacing.md }}
                onSubmitEditing={submit}
              />
            )}
          </View>

          {error ? (
            <InlineNotice tone="danger" style={{ marginTop: spacing.md }}>
              {error}
            </InlineNotice>
          ) : null}

          <Button
            label={mode === 'register' && !quickLogin ? 'Hesap Aç' : 'Giriş Yap'}
            onPress={submit}
            loading={loading}
            style={{ marginTop: spacing.lg }}
          />

          {quickLogin && (
            <Pressable onPress={switchAccount} hitSlop={8} style={{ marginTop: spacing.lg, alignSelf: 'center' }}>
              <Text style={[type.captionMedium, { color: colors.accent }]}>Farklı bir hesapla giriş yap</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.bgCardAlt,
    borderRadius: radii.md,
    padding: 4,
    marginBottom: spacing.md,
  },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radii.sm },
  segmentActive: { backgroundColor: colors.bgCard, ...cardShadow },
  card: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...cardShadow,
  },
});
