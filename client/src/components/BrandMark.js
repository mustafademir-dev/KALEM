import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, fonts } from '../theme/index.js';

/**
 * KALEM marka işareti: amber zemin üzerinde bir kalem ucu (nib).
 * `wordmark` açıksa yanında "KALEM" yazısı gelir.
 */
export default function BrandMark({ size = 32, wordmark = false, color = colors.textPrimary, style }) {
  return (
    <View style={[styles.row, style]}>
      <Svg width={size} height={size} viewBox="0 0 36 36" accessibilityLabel="KALEM">
        <Rect width="36" height="36" rx="10" fill={colors.accent} />
        <Path d="M18 7 L24.5 17 L21.5 26 L18 29.5 L14.5 26 L11.5 17 Z" fill={colors.white} />
        <Path d="M18 18.5 V27" stroke={colors.accent} strokeWidth="1.6" strokeLinecap="round" />
        <Circle cx="18" cy="16.4" r="1.7" fill={colors.accent} />
      </Svg>
      {wordmark ? (
        <Text style={[styles.word, { color, fontSize: Math.round(size * 0.56) }]}>KALEM</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: { fontFamily: fonts.extraBold, letterSpacing: 2.2 },
});
