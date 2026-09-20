import React from 'react';
import { Text } from 'react-native';
import { colors, fonts } from '../theme/index.js';
import { formatTl, tlParts } from '../utils/format.js';

/**
 * Tutarı TL olarak hiyerarşik gösterir: tam kısım büyük, kuruş ve birim küçük.
 * Tam sayılar ondalıksız ("1 TL"), kesirliler virgüllü ("1.250,75 TL") — biçim
 * kuralları `tlParts`'ta. Değer stroop cinsinden gelir (1 dTL = 1 TL);
 * yalnızca sunumdur.
 */
export default function Amount({ stroops, size = 36, color = colors.accent, align, style }) {
  const { negative, whole, fraction } = tlParts(stroops);
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      accessibilityLabel={formatTl(stroops)}
      style={[
        { fontFamily: fonts.extraBold, fontSize: size, lineHeight: Math.round(size * 1.2), color, letterSpacing: -0.5 },
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {negative ? '-' : ''}
      {whole}
      {fraction ? (
        <Text style={{ fontSize: Math.round(size * 0.5), fontFamily: fonts.bold, letterSpacing: 0 }}>,{fraction}</Text>
      ) : null}
      <Text style={{ fontSize: Math.round(size * 0.42), fontFamily: fonts.semiBold, letterSpacing: 0 }}> TL</Text>
    </Text>
  );
}
