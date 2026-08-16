import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { colors } from '../theme/index.js';

export default function Screen({ children, style }) {
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={[styles.safeArea, style]}>{children}</SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safeArea: {
    flex: 1,
  },
});
