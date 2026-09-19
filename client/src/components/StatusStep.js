import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon.js';
import { colors, spacing, type } from '../theme/index.js';

/**
 * İşlem adımı satırı — İmzalama & Gönderim ekranında kullanılır.
 * state: 'pending' | 'active' | 'done' | 'error'
 *
 * `hint` (isteğe bağlı) etiketin altında kısa bir açıklama gösterir; yalnızca
 * adım aktifken/hata verdiğinde görünür. `isLast` false ise adımlar arasında
 * dikey bir bağlantı çizgisi çizilir.
 */
export default function StatusStep({ label, state, hint, isLast = true }) {
  const showHint = hint && (state === 'active' || state === 'error');
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={styles.indicator}>{renderIndicator(state)}</View>
        {!isLast && (
          <View style={[styles.connector, { backgroundColor: state === 'done' ? colors.success : colors.border }]} />
        )}
      </View>
      <View style={[styles.textCol, !isLast && { paddingBottom: spacing.md }]}>
        <Text
          style={[
            type.bodyMedium,
            { color: state === 'pending' ? colors.textMuted : colors.textPrimary, marginTop: 3 },
          ]}
        >
          {label}
        </Text>
        {showHint ? (
          <Text style={[type.caption, { color: state === 'error' ? colors.danger : colors.textMuted, marginTop: 2 }]}>
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function renderIndicator(state) {
  if (state === 'active') {
    return (
      <View style={[styles.dot, { backgroundColor: colors.accentMuted }]}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }
  if (state === 'done') {
    return (
      <View style={[styles.dot, { backgroundColor: colors.success }]}>
        <Icon name="check" size={14} color={colors.white} strokeWidth={3} />
      </View>
    );
  }
  if (state === 'error') {
    return (
      <View style={[styles.dot, { backgroundColor: colors.danger }]}>
        <Icon name="x" size={14} color={colors.white} strokeWidth={3} />
      </View>
    );
  }
  return <View style={[styles.dot, styles.dotPending]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  rail: { alignItems: 'center', width: 28 },
  indicator: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 2, flex: 1, minHeight: 12, borderRadius: 1, marginVertical: 2 },
  textCol: { flex: 1 },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dotPending: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bgCard },
});
