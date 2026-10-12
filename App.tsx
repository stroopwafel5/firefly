import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  Rubik_300Light,
  Rubik_400Regular,
  Rubik_500Medium,
  Rubik_600SemiBold,
  Rubik_700Bold,
  Rubik_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/rubik';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AuthProvider } from './src/context/AuthContext';
import { setFontsReady } from './src/fonts';
import { I18nProvider } from './src/i18n';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';

export default function App() {
  // The fonts are bundled with the app, so this takes a moment; if they fail, the phone's font is used.
  // Inter is the English typeface; Rubik is used for Hebrew and Russian (see src/fonts.ts).
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Rubik_300Light,
    Rubik_400Regular,
    Rubik_500Medium,
    Rubik_600SemiBold,
    Rubik_700Bold,
    Rubik_800ExtraBold,
  });
  // Never wait more than a few seconds for the fonts: after that the phone's own font is used.
  const [fontWait, setFontWait] = React.useState(true);
  React.useEffect(() => {
    const t = setTimeout(() => setFontWait(false), 5000);
    return () => clearTimeout(t);
  }, []);
  setFontsReady(fontsLoaded && !fontError);
  if (!fontsLoaded && !fontError && fontWait) return <View style={{ flex: 1, backgroundColor: colors.night }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <I18nProvider>
            <AuthProvider>
              <StatusBar style="light" />
              <RootNavigator />
            </AuthProvider>
          </I18nProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
