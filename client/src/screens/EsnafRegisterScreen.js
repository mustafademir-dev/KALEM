import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import TextField from '../components/TextField.js';
import BackButton from '../components/BackButton.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { generateEphemeralMerchantKeypair, bytesToBase64, saveMerchantSession } from '../services/merchant-auth.service.js';
import { buildMerchantOwnershipChallenge } from '../utils/merchantChallenge.js';
import { registerMerchant, getMerchantBalance, ApiError } from '../services/api.service.js';
import { shortenMiddle } from '../utils/format.js';

/**
 * Esnaf KAYDI — demo amaçlı, admin onayı/on-chain kayıt akışını EKRANDA
 * BEKLEMEZ (bkz. approve-merchant.mjs, bu uygulamanın kapsamı dışında,
 * arka planda ayrıca çalıştırılır). Amaç: "yeni bir esnaf kaydoluyor"
 * sahnesini gösterebilmek.
 */
export default function EsnafRegisterScreen() {
  const { navigate, reset } = useNavigation();

  const [businessName, setBusinessName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { merchantId, apiKey, stellarAddress, businessName }

  const handleRegister = useCallback(async () => {
    setError(null);
    if (!businessName.trim() || !taxId.trim()) {
      setError('İşletme adı ve vergi kimlik numarası zorunludur.');
      return;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (password !== password2) {
      setError('Şifreler aynı değil.');
      return;
    }
    setLoading(true);
    try {
      const ephemeral = generateEphemeralMerchantKeypair();
      const challenge = buildMerchantOwnershipChallenge(taxId.trim(), ephemeral.stellarAddress);
      const signature = ephemeral.sign(Buffer.from(challenge, 'utf8'));

      const response = await registerMerchant({
        businessName: businessName.trim(),
        taxId: taxId.trim(),
        stellarAddress: ephemeral.stellarAddress,
        signature: bytesToBase64(signature),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        password,
      });

      setResult({
        merchantId: response.merchantId,
        apiKey: response.apiKey,
        stellarAddress: ephemeral.stellarAddress,
        businessName: response.businessName,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_REGISTERED') {
        setError('Bu vergi kimlik numarası zaten kayıtlı.');
      } else if (err instanceof ApiError) {
        setError(err.message ?? 'Kayıt oluşturulamadı.');
      } else {
        setError('Beklenmeyen bir hata oluştu.');
      }
    } finally {
      setLoading(false);
    }
  }, [businessName, taxId, email, phone, password, password2]);

  const handleGoToDashboard = useCallback(async () => {
    const session = {
      merchantId: result.merchantId,
      apiKey: result.apiKey,
      businessName: result.businessName,
    };
    await saveMerchantSession(session);
    try {
      const balance = await getMerchantBalance(session.merchantId, session.apiKey);
      reset('MerchantDashboard', {
        session,
        balance: balance.balance,
        stellarAddress: balance.stellarAddress,
        kycStatus: balance.kycStatus,
        onChainRegistered: balance.onChainRegistered,
      });
    } catch {
      // Bakiye sorgusu başarısız olsa bile oturum kaydedildi — Giriş
      // ekranı bir sonraki açılışta otomatik devam edecektir.
      reset('MerchantLogin');
    }
  }, [result, reset]);

  if (result) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[type.h1, { color: colors.textPrimary }]}>Kayıt Tamamlandı</Text>
          <Text style={[type.body, { color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg }]}>
            Bundan sonra vergi numaranız ve şifrenizle giriş yapabilirsiniz.
          </Text>

          <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.md }]}>
            İşletmeniz onaylandığında ödeme almaya başlayabilirsiniz. Onaylanana kadar panelde "Beklemede"
            rozeti görünür.
          </Text>

          <Button label="Panele Git" onPress={handleGoToDashboard} style={{ marginTop: spacing.xl }} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackButton style={{ marginBottom: spacing.sm }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>Esnaf Kaydı</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4, marginBottom: spacing.lg }]}>
          İşletmenizi kaydedin, bir API anahtarı alın
        </Text>

        <TextField
          label="İşletme Adı"
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="Kalem Kırtasiye"
          style={{ marginBottom: spacing.md }}
        />
        <TextField
          label="Vergi Kimlik Numarası"
          value={taxId}
          onChangeText={setTaxId}
          placeholder="1234567890"
          keyboardType="number-pad"
          style={{ marginBottom: spacing.md }}
        />
        <TextField
          label="E-posta (isteğe bağlı)"
          value={email}
          onChangeText={setEmail}
          placeholder="isim@ornek.com"
          autoCapitalize="none"
          style={{ marginBottom: spacing.md }}
        />
        <TextField
          label="Telefon (isteğe bağlı)"
          value={phone}
          onChangeText={setPhone}
          placeholder="5551112233"
          keyboardType="phone-pad"
          style={{ marginBottom: spacing.md }}
        />
        <TextField
          label="Şifre"
          value={password}
          onChangeText={setPassword}
          placeholder="En az 6 karakter"
          secureTextEntry
          autoCapitalize="none"
          style={{ marginBottom: spacing.md }}
        />
        <TextField
          label="Şifre (tekrar)"
          value={password2}
          onChangeText={setPassword2}
          placeholder="Şifrenizi tekrar girin"
          secureTextEntry
          autoCapitalize="none"
          style={{ marginBottom: spacing.lg }}
        />

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={[type.captionMedium, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        <Button label="Kayıt Ol" onPress={handleRegister} loading={loading} />

        <Text
          style={[type.captionMedium, { color: colors.accent, textAlign: 'center', marginTop: spacing.lg }]}
          onPress={() => navigate('MerchantLogin')}
        >
          Zaten hesabın var mı? Giriş Yap
        </Text>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value, mono }) {
  const handleCopy = useCallback(() => {
    Clipboard.setStringAsync(value);
  }, [value]);

  return (
    <View style={styles.infoRow}>
      <Text style={[type.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[mono ? type.mono : type.bodyMedium, { color: colors.textPrimary, marginTop: 2 }]}
        numberOfLines={1}
        onPress={handleCopy}
      >
        {value} {mono ? '· dokun: kopyala' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingTop: spacing.xl },
  errorBanner: {
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.dangerBg,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...cardShadow,
  },
  infoRow: { marginBottom: spacing.xs },
});
