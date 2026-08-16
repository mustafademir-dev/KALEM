import React from 'react';
import { Pressable, Text } from 'react-native';
import { colors, type } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';

export default function BackButton({ style }) {
  const { goBack, canGoBack } = useNavigation();
  if (!canGoBack) return null;

  return (
    <Pressable onPress={goBack} style={style} hitSlop={8}>
      <Text style={[type.captionMedium, { color: colors.textMuted }]}>← Geri</Text>
    </Pressable>
  );
}
