import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';

const VARIANTS = {
  primary: {
    bg: colors.accent,
    bgPressed: colors.accentStrong,
    text: colors.onAccent,
    border: 'transparent',
  },
  secondary: {
    bg: 'transparent',
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

export default function Button({ label, onPress, variant = 'primary', loading = false, disabled = false, style }) {
  const palette = VARIANTS[variant] ?? VARIANTS.primary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && cardShadow,
        {
          backgroundColor: pressed && !isDisabled ? palette.bgPressed : palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border === 'transparent' ? 0 : 1.5,
          opacity: isDisabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={[type.bodyMedium, styles.label, { color: palette.text }]}>{label}</Text>
      )}
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
  label: {
    letterSpacing: 0.2,
  },
});
