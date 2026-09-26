import 'react-native-gesture-handler';
import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
  Poppins_900Black,
} from '@expo-google-fonts/poppins';
import RootNavigator from './src/navigation/RootNavigator';
// Registers the notification handler (governs whether a scheduled rest-timer
// notification shows/plays while foregrounded vs. backgrounded) as early as
// possible — side-effect-only import, see restNotifications.ts.
import './src/lib/restNotifications';

export default function App() {
  // Every screen's Text/TextInput comes from src/components/AppText.tsx, not
  // 'react-native' directly, so these are the only weights that need to be
  // loaded here — see that file for the fontWeight -> Poppins face mapping.
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
    Poppins_900Black,
  });

  if (!fontsLoaded) {
    // Matches colors.background so there's no flash while the font loads.
    return <View style={{ flex: 1, backgroundColor: '#111827' }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}