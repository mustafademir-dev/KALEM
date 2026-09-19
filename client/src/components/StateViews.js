import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from './Icon.js';
import { colors, radii, spacing, type } from '../theme/index.js';

/** Web'de native driver yok; orada JS sürücüsü kullanılır. */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/** Yükleniyor yer tutucusu — metin "Yükleniyor…" yerine nabız atan bir çubuk. */
export function Skeleton({ width = 96, height = 14, style }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityLabel="Yükleniyor"
      style={[{ width, height, borderRadius: height / 2, backgroundColor: colors.border, opacity }, style]}
    />
  );
}

/** "Canlı" göstergesi: yumuşakça genişleyip sönen nokta. */
export function PulseDot({ color = colors.accent, size = 8 }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scale, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: USE_NATIVE_DRIVER })
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const ringScale = scale.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const ringOpacity = scale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={{ width: size * 2.6, height: size * 2.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

const TONES = {
  danger: { bg: colors.dangerBg, fg: colors.danger, icon: 'alert' },
  warning: { bg: colors.warningBg, fg: colors.warning, icon: 'alert' },
  info: { bg: colors.bgCardAlt, fg: colors.textSecondary, icon: 'info' },
  success: { bg: colors.successBg, fg: colors.success, icon: 'check' },
};

/** Satır içi bildirim: ikon + metin (+ isteğe bağlı eylem). Hata/uyarı/bilgi için ortak. */
export function InlineNotice({ tone = 'info', icon, children, actionLabel, onAction, style }) {
  const t = TONES[tone] ?? TONES.info;
  return (
    <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: t.bg }, style]}>
      <Icon name={icon ?? t.icon} size={18} color={t.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[type.caption, { color: t.fg }]}>{children}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
            <Text style={[type.captionMedium, { color: t.fg, textDecorationLine: 'underline' }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Ekran boyutlu durum sonucu için büyük yuvarlak rozet — yay animasyonuyla belirir. */
export function StatusBadge({ tone = 'success', size = 84, icon }) {
  // İçerik animasyona BAĞIMLI değil: rozet her zaman görünür (opaklık sabit),
  // yalnızca hafif bir "yerine oturma" ölçeği animasyonu vardır.
  const scale = useRef(new Animated.Value(0.82)).current;
  const t = TONES[tone] ?? TONES.success;
  const glyph = icon ?? (tone === 'danger' ? 'x' : tone === 'warning' ? 'clock' : 'check');

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 90, useNativeDriver: USE_NATIVE_DRIVER }).start();
  }, [scale]);

  return (
    <Animated.View
      style={{
        width: size + 28,
        height: size + 28,
        borderRadius: 999,
        backgroundColor: t.bg,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale }],
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: t.fg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={glyph} size={Math.round(size * 0.48)} color={colors.white} strokeWidth={2.6} />
      </View>
    </Animated.View>
  );
}

/** Esnafın adının baş harfiyle yuvarlak avatar. */
export function MerchantAvatar({ name, size = 44 }) {
  const initial = (name ?? '?').trim().charAt(0).toLocaleUpperCase('tr-TR') || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.pill,
        backgroundColor: colors.accentMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: size * 0.42, color: colors.accentStrong }}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'flex-start',
  },
});
