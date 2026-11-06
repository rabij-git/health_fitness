import 'react-native-gesture-handler';
import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
    // react-navigation has always recommended wrapping the app root in this
    // (it's what actually registers the native gesture responder system the
    // side-effect import above only pulls in) — added explicitly as part of
    // the SDK 58 upgrade, which bumped react-native-gesture-handler 2.x→3.x.
    // The app never needed this before (no direct Gesture API usage, no
    // native-stack navigator — only bottom-tabs, which doesn't gesture-drive
    // its own tab switching), so it was silently fine without one on v2; a
    // zero-downside addition to remove any doubt under the new major version
    // rather than leave it unverified.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}