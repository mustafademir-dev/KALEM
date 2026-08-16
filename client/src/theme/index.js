/**
 * KALEM Tasarım Sistemi
 *
 * Kırık beyaz zemin + koyu amber vurgu + lacivert-antrasit metin. Türk
 * bankacılık uygulamalarının (Papara, Enpara, İş Bankası mobil) temiz/açık
 * hissi hedeflenir — jenerik "AI görünümlü" varsayılanlar (mor-mavi
 * gradient, aşırı yuvarlak köşe, boş ortalanmış kartlar) ve koyu tema
 * kasıtlı olarak kullanılmaz.
 */

import { Platform } from 'react-native';

export const colors = {
  bg: '#F7F8FA',
  bgElevated: '#FFFFFF',
  bgCard: '#FFFFFF',
  bgCardAlt: '#F1F3F6',
  border: '#E3E6EB',
  borderStrong: '#C7CCD6',

  accent: '#D97706',
  accentStrong: '#B45309',
  accentMuted: '#FBEBD3',
  onAccent: '#FFFFFF',

  textPrimary: '#1A2B4C',
  textSecondary: '#4B5768',
  textMuted: '#8993A4',

  success: '#1E8E5A',
  successBg: '#E6F4EC',
  danger: '#D14343',
  dangerBg: '#FBEAEA',
  warning: '#B45309',
  warningBg: '#FDF3E2',

  white: '#FFFFFF',
  black: '#000000',
  scrim: 'rgba(26, 43, 76, 0.45)',
};

/** Kartlar için "ince gri kenarlık + hafif gölge" — iOS/Android/web ortak. */
export const cardShadow = {
  shadowColor: '#1A2B4C',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
};

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const type = {
  display: { fontFamily: fonts.extraBold, fontSize: 40, lineHeight: 46, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30 },
  h2: { fontFamily: fonts.semiBold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  captionMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  micro: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18 },
};

const theme = { colors, spacing, radii, fonts, type, cardShadow };

export default theme;
