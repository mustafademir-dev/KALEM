import './polyfills.js';

import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { registerRootComponent } from 'expo';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { colors } from './theme/index.js';
import { NavigationProvider, useNavigation } from './navigation/Navigator.js';
import RoleSelectScreen from './screens/RoleSelectScreen.js';
import CustomerDashboardScreen from './screens/CustomerDashboardScreen.js';
import CustomerTopUpScreen from './screens/CustomerTopUpScreen.js';
import PaymentScreen from './screens/PaymentScreen.js';
import EsnafLoginScreen from './screens/EsnafLoginScreen.js';
import EsnafDashboardScreen from './screens/EsnafDashboardScreen.js';
import EsnafAmountEntryScreen from './screens/EsnafAmountEntryScreen.js';
import EsnafQrScreen from './screens/EsnafQrScreen.js';
import EsnafHistoryScreen from './screens/EsnafHistoryScreen.js';

const SCREENS = {
  RoleSelect: RoleSelectScreen,
  CustomerDashboard: CustomerDashboardScreen,
  CustomerTopUp: CustomerTopUpScreen,
  CustomerPayment: PaymentScreen,
  MerchantLogin: EsnafLoginScreen,
  MerchantDashboard: EsnafDashboardScreen,
  MerchantAmountEntry: EsnafAmountEntryScreen,
  MerchantQr: EsnafQrScreen,
  MerchantHistory: EsnafHistoryScreen,
};

function RootNavigator() {
  const { current } = useNavigation();
  const ScreenComponent = SCREENS[current.name];
  return <ScreenComponent params={current.params ?? {}} />;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationProvider initialRoute={{ name: 'RoleSelect' }}>
      <RootNavigator />
    </NavigationProvider>
  );
}

registerRootComponent(App);
