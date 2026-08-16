import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme/index.js';

/**
 * İşlem adımı satırı — İmzalama & Gönderim ekranında kullanılır.
 * state: 'pending' | 'active' | 'done' | 'error'
 */
export default function StatusStep({ label, state }) {
  return (
    <View style={styles.row}>
      <View style={styles.indicator}>{renderIndicator(state)}</View>
      <Text
        style={[
          type.bodyMedium,
          {
            color: state === 'pending' ? colors.textMuted : colors.textPrimary,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function renderIndicator(state) {
  if (state === 'active') {
    return <ActivityIndicator size="small" color={colors.accent} />;
  }
  if (state === 'done') {
    return (
      <View style={[styles.dot, { backgroundColor: colors.success }]}>
        <Text style={styles.check}>✓</Text>
      </View>
    );
  }
  if (state === 'error') {
    return (
      <View style={[styles.dot, { backgroundColor: colors.danger }]}>
        <Text style={styles.check}>!</Text>
      </View>
    );
  }
  return <View style={[styles.dot, styles.dotPending]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  indicator: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotPending: {
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  check: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
});
