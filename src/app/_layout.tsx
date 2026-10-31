import * as ScreenCapture from 'expo-screen-capture';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LockOverlay } from '../components/LockOverlay';
import { LockProvider, useLock } from '../lib/lock';
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

/** Opens the document when the user taps its expiry reminder (shown once the app is unlocked). */
function ReminderTapHandler() {
  const response = Notifications.useLastNotificationResponse();
  const { data } = useVault();
  const itemId = response?.notification.request.content.data?.itemId;
  const ready = !!data;
  useEffect(() => {
    if (!ready || typeof itemId !== 'string' || response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      return;
    }
    router.push({ pathname: '/item/[id]', params: { id: itemId } });
    Notifications.clearLastNotificationResponse();
  }, [ready, itemId, response]);
  return null;
}

/** Hands the saved lock timeout to the lock, which lives above the vault. */
function LockGraceSync() {
  const { data } = useVault();
  const { setGraceMs } = useLock();
  const grace = data?.settings.lockGraceMs;
  useEffect(() => {
    if (grace !== undefined) setGraceMs(grace);
  }, [grace, setGraceMs]);
  return null;
}

/** The screens, hidden from screen readers while the lock overlay covers them. */
function Screens({ children }: { children: React.ReactNode }) {
  const { locked } = useLock();
  return (
    <View
      style={{ flex: 1 }}
      importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={locked}
    >
      {children}
    </View>
  );
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LockProvider>
          <VaultProvider>
            <ScreenshotGuard />
            <LockGraceSync />
            <ReminderTapHandler />
            <View style={{ flex: 1, backgroundColor: t.bg }}>
              <Screens>
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
                  <Stack.Screen name="backup" options={{ title: 'Backup' }} />
                  <Stack.Screen
                    name="viewer"
                    options={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#000' } }}
                  />
                </Stack>
              </Screens>
              <LockOverlay />
            </View>
            <StatusBar style="auto" />
          </VaultProvider>
        </LockProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
