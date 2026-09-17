import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
// Registers the notification handler (governs whether a scheduled rest-timer
// notification shows/plays while foregrounded vs. backgrounded) as early as
// possible — side-effect-only import, see restNotifications.ts.
import './src/lib/restNotifications';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}