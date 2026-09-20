import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../theme/index.js';

/**
 * Çizgi ikon seti (24×24 ızgara, 2px çizgi, yuvarlak uç) — ek bağımlılık ve
 * font yüklemesi gerektirmez; react-native-svg ile web/iOS/Android'de aynı görünür.
 * Şekiller Lucide ikon ailesinin çizim diline uygundur.
 */
const ICONS = {
  check: <Path d="M20 6 9 17l-5-5" />,
  x: <Path d="M18 6 6 18M6 6l12 12" />,
  alert: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 8v4M12 16h.01" />
    </>
  ),
  info: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 16v-4M12 8h.01" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 6v6l4 2" />
    </>
  ),
  arrowLeft: <Path d="M19 12H5M12 19l-7-7 7-7" />,
  arrowRight: <Path d="M5 12h14M12 5l7 7-7 7" />,
  refresh: <Path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />,
  external: <Path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
  copy: (
    <>
      <Rect x="9" y="9" width="13" height="13" rx="2" />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  wallet: (
    <>
      <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </>
  ),
  qr: (
    <>
      <Rect x="3" y="3" width="7" height="7" rx="1" />
      <Rect x="14" y="3" width="7" height="7" rx="1" />
      <Rect x="3" y="14" width="7" height="7" rx="1" />
      <Path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4M20 17v.01" />
    </>
  ),
  scan: <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />,
  camera: (
    <>
      <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <Circle cx="12" cy="13" r="3" />
    </>
  ),
  receipt: (
    <>
      <Path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <Path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  history: <Path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l4 2" />,
  logout: <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  shield: (
    <>
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <Path d="m9 12 2 2 4-4" />
    </>
  ),
  home: (
    <>
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M9 22V12h6v10" />
    </>
  ),
  heart: (
    <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  ),
  calendar: (
    <>
      <Path d="M8 2v4M16 2v4M3 10h18" />
      <Rect x="3" y="4" width="18" height="18" rx="2" />
    </>
  ),
  download: <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />,
  user: (
    <>
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </>
  ),
  chevronRight: <Path d="m9 18 6-6-6-6" />,
  chevronLeft: <Path d="m15 18-6-6 6-6" />,
  backspace: (
    <>
      <Path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
      <Path d="m18 9-6 6M12 9l6 6" />
    </>
  ),
  store: (
    <>
      <Path d="M3 9l1.5-5h15L21 9M3 9h18M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <Path d="M5 12v8h14v-8M10 20v-4h4v4" />
    </>
  ),
};

/**
 * @param {object} props
 * @param {keyof typeof ICONS} props.name
 * @param {number} [props.size=20]
 * @param {string} [props.color]
 * @param {number} [props.strokeWidth=2]
 */
export default function Icon({ name, size = 20, color = colors.textPrimary, strokeWidth = 2, style }) {
  const glyph = ICONS[name];
  if (!glyph) return null;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {glyph}
    </Svg>
  );
}
