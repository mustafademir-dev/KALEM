import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';

const VARIANTS = {
  primary: {
    bg: colors.accent,
    bgPressed: colors.accentStrong,
    text: colors.onAccent,
    border: 'transparent',
  },
  secondary: {
    bg: colors.bgCard,
    bgPressed: colors.bgCardAlt,
    text: colors.textPrimary,
    border: colors.borderStrong,
  },
  danger: {
    bg: colors.dangerBg,
    bgPressed: '#F5D3D3',
    text: colors.danger,
    border: colors.danger,
  },
};

/**
 * @param {object} props
 * @param {string} [props.icon] - Icon.js'teki bir ikon adı; etiketin soluna konur.
 * @param {boolean} [props.loading] - Etiket KORUNUR (genişlik zıplamaz), yanında döner gösterge çıkar.
 */
export default function Button({ label, onPress, variant = 'primary', loading = false, disabled = false, icon, style }) {
  const palette = VARIANTS[variant] ?? VARIANTS.primary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && !isDisabled && cardShadow,
        {
          backgroundColor: pressed && !isDisabled ? palette.bgPressed : palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border === 'transparent' ? 0 : 1.5,
          opacity: disabled && !loading ? 0.45 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : icon ? (
          <Icon name={icon} size={18} color={palette.text} />
        ) : null}
        <Text style={[type.bodyMedium, styles.label, { color: palette.text, opacity: loading ? 0.75 : 1 }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  label: { letterSpacing: 0.2 },
});
