import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Icon from './Icon.js';
import { colors, type } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';

export default function BackButton({ style }) {
  const { goBack, canGoBack } = useNavigation();
  if (!canGoBack) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Geri"
      onPress={goBack}
      hitSlop={10}
      style={({ pressed }) => [styles.base, { opacity: pressed ? 0.6 : 1 }, style]}
    >
      <Icon name="arrowLeft" size={16} color={colors.textSecondary} />
      <Text style={[type.captionMedium, { color: colors.textSecondary }]}>Geri</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
});
