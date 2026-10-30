import * as ScreenCapture from 'expo-screen-capture';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LockOverlay } from '../components/LockOverlay';
import { LockProvider } from '../lib/lock';
import { VaultProvider, useVault } from '../lib/store';
import { useTheme } from '../lib/theme';

/** Blocks screenshots and hides the app in the recents screen (FLAG_SECURE on Android). */
function ScreenshotGuard() {
  const { data } = useVault();
  const block = data?.settings.blockScreenshots ?? true;
  useEffect(() => {
    if (block) ScreenCapture.preventScreenCaptureAsync('app');
    else ScreenCapture.allowScreenCaptureAsync('app');
  }, [block]);
  return null;
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <SafeAreaProvider>
      <LockProvider>
        <VaultProvider>
          <ScreenshotGuard />
          <View style={{ flex: 1, backgroundColor: t.bg }}>
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: t.card },
                headerTintColor: t.text,
                contentStyle: { backgroundColor: t.bg },
              }}
            >
              <Stack.Screen name="index" options={{ title: 'DocBolso' }} />
              <Stack.Screen name="form" options={{ title: 'Novo item' }} />
              <Stack.Screen name="item/[id]" options={{ title: '' }} />
              <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
              <Stack.Screen
                name="viewer"
                options={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000' } }}
              />
            </Stack>
            <LockOverlay />
          </View>
          <StatusBar style="auto" />
        </VaultProvider>
      </LockProvider>
    </SafeAreaProvider>
  );
}
