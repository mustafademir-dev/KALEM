import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import Icon from '../components/Icon.js';
import { InlineNotice } from '../components/StateViews.js';
import { colors, radii, spacing, type } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { getDepartments, saveDepartments, ApiError } from '../services/api.service.js';

const MAX_DEPARTMENTS = 8;

/**
 * Departman (kısım) tanımları: ad + KDV oranı. Oran yalnızca işletmeye tanımlı
 * oranlardan seçilebilir — yazar kasalarda da oranlar faaliyet koduna göre sabittir.
 */
export default function EsnafDepartmentsScreen({ params }) {
  const { session } = params;
  const { goBack } = useNavigation();
  const [rows, setRows] = useState(null);
  const [allowed, setAllowed] = useState([1, 10, 20]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    getDepartments(session.merchantId, session.apiKey)
      .then((res) => {
        if (!alive) return;
        setRows(res.departments.map((d) => ({ ...d })));
        setAllowed(res.allowedVatRates);
      })
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : 'Departmanlar alınamadı.'));
    return () => {
      alive = false;
    };
  }, [session]);

  const update = (i, patch) => {
    setSaved(false);
    setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const save = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await saveDepartments(session.merchantId, session.apiKey, rows);
      setRows(res.departments.map((d) => ({ ...d })));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }, [rows, session]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <BackButton style={{ marginBottom: spacing.sm }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>Departmanlar</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
          Ödeme alırken seçtiğiniz kısımlar. Fişteki KDV, seçilen departmanın oranıyla hesaplanır.
        </Text>

        {!rows && !error ? <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} /> : null}

        {rows?.map((row, i) => (
          <View key={i} style={styles.card}>
            <View style={styles.rowHead}>
              <TextInput
                value={row.name}
                onChangeText={(name) => update(i, { name })}
                placeholder="Departman adı"
                placeholderTextColor={colors.textMuted}
                maxLength={24}
                style={styles.nameInput}
              />
              {rows.length > 1 ? (
                <Pressable
                  onPress={() => {
                    setSaved(false);
                    setRows((list) => list.filter((_, idx) => idx !== i));
                  }}
                  hitSlop={8}
                  accessibilityLabel={`${row.name} departmanını sil`}
                >
                  <Icon name="x" size={18} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.rates}>
              {allowed.map((rate) => (
                <Pressable
                  key={rate}
                  onPress={() => update(i, { vatRate: rate })}
                  style={[styles.rateChip, row.vatRate === rate && styles.rateChipActive]}
                >
                  <Text
                    style={[type.captionMedium, { color: row.vatRate === rate ? colors.accentStrong : colors.textSecondary }]}
                  >
                    %{rate} KDV
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {rows && rows.length < MAX_DEPARTMENTS ? (
          <Button
            label="Departman Ekle"
            variant="secondary"
            onPress={() => {
              setSaved(false);
              setRows((list) => [...list, { name: '', vatRate: allowed.includes(20) ? 20 : allowed[0] }]);
            }}
            style={{ marginTop: spacing.md }}
          />
        ) : null}

        {error ? (
          <InlineNotice tone="danger" style={{ marginTop: spacing.md }}>
            {error}
          </InlineNotice>
        ) : null}
        {saved ? (
          <InlineNotice tone="success" style={{ marginTop: spacing.md }} actionLabel="Geri dön" onAction={goBack}>
            Departmanlar kaydedildi.
          </InlineNotice>
        ) : null}

        {rows ? (
          <Button label="Kaydet" onPress={save} loading={saving} style={{ marginTop: spacing.lg }} />
        ) : null}

        <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.md }]}>
          İşletmenize tanımlı KDV oranları: {allowed.map((r) => `%${r}`).join(', ')}. Farklı bir oran gerekiyorsa
          destekle iletişime geçin.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameInput: {
    flex: 1,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    color: colors.textPrimary,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  rates: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  rateChip: {
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rateChipActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
});
