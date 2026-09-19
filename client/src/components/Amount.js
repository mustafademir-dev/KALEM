import React from 'react';
import { Text } from 'react-native';
import { colors, fonts } from '../theme/index.js';
import { stroopsToDtl } from '../utils/format.js';

/**
 * dTL tutarını hiyerarşik gösterir: tam kısım büyük, 7 ondalık ve birim küçük.
 * Böylece "124.7500000 dTL" gibi uzun değerler dar ekranda satır kırmaz ve
 * asıl rakam öne çıkar. Değer/biçim `stroopsToDtl` ile AYNIDIR — yalnızca sunum.
 */
export default function Amount({ stroops, size = 36, color = colors.accent, align, style }) {
  const [whole, fraction] = stroopsToDtl(stroops).split('.');
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      accessibilityLabel={`${whole}.${fraction} dTL`}
      style={[
        { fontFamily: fonts.extraBold, fontSize: size, lineHeight: Math.round(size * 1.2), color, letterSpacing: -0.5 },
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {whole}
      <Text style={{ fontSize: Math.round(size * 0.5), fontFamily: fonts.bold, letterSpacing: 0 }}>.{fraction}</Text>
      <Text style={{ fontSize: Math.round(size * 0.42), fontFamily: fonts.semiBold, letterSpacing: 0 }}> dTL</Text>
    </Text>
  );
}
