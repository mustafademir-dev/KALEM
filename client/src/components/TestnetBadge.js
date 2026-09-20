import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from './Icon.js';
import { colors, radii, spacing, type } from '../theme/index.js';

/**
 * "Test ağı" etiketi. Arayüzde tutarlar "TL" olarak gösterilir (1 dTL = 1 TL) ama bunlar
 * Stellar TESTNET üzerindeki demo bakiyelerdir — gerçek para değildir. Bu etiket, jürinin ve
 * kullanıcının bunu gerçek para sanmasını önler.
 *
 * @param {object} props
 * @param {boolean} [props.note] - Açıklama da yazılsın: "Test ağı · gerçek para değildir".
 */
export default function TestnetBadge({ note = false, style }) {
  return (
    <View
      accessibilityLabel="Test ağı: gerçek para değildir"
      style={[styles.pill, style]}
    >
      <Icon name="info" size={12} color={colors.warning} strokeWidth={2.4} />
      <Text style={[type.micro, { color: colors.warning }]}>
        {note ? 'Test ağı · gerçek para değildir' : 'Test ağı'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.warningBg,
  },
});
