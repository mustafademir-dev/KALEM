import React, { useState } from 'react';
import { TextInput, View, Text, StyleSheet } from 'react-native';
import { colors, radii, spacing, type } from '../theme/index.js';

export default function TextField({ label, value, onChangeText, placeholder, error, style, ...rest }) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={style}>
      {label ? <Text style={[type.captionMedium, { color: colors.textSecondary, marginBottom: 6 }]}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            borderColor: error ? colors.danger : focused ? colors.accent : colors.border,
          },
        ]}
        {...rest}
      />
      {error ? <Text style={[type.caption, { color: colors.danger, marginTop: 4 }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 52,
    borderRadius: radii.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    backgroundColor: colors.bgCard,
  },
});
