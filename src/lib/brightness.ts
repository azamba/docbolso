import * as Brightness from 'expo-brightness';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';

/** Turns the screen to max brightness while the calling screen is focused. */
export function useMaxBrightness(enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let previous: number | null = null;
      Brightness.getBrightnessAsync()
        .then((b) => {
          previous = b;
          return Brightness.setBrightnessAsync(1);
        })
        .catch(() => {});
      return () => {
        if (Platform.OS === 'android') Brightness.restoreSystemBrightnessAsync().catch(() => {});
        else if (previous !== null) Brightness.setBrightnessAsync(previous).catch(() => {});
      };
    }, [enabled]),
  );
}
