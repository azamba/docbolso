import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { clearImageCache } from './vault';

/** How long the app may stay in the background before it locks again. */
const LOCK_GRACE_MS = 30_000;

interface LockContextValue {
  locked: boolean;
  /** True once the user has unlocked at least once in this session. */
  everUnlocked: boolean;
  /** True when the phone has no PIN/biometrics, so the app can't really be locked. */
  deviceUnprotected: boolean;
  unlock: () => Promise<void>;
  lockNow: () => void;
  /** Runs `fn` (e.g. camera, picker) without locking when the app goes to the background. */
  withoutLocking: <T>(fn: () => Promise<T>) => Promise<T>;
}

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(true);
  const [everUnlocked, setEverUnlocked] = useState(false);
  const [deviceUnprotected, setDeviceUnprotected] = useState(false);
  const suspended = useRef(0);
  const backgroundAt = useRef<number | null>(null);
  const authenticating = useRef(false);

  const withoutLocking = useCallback(async <T,>(fn: () => Promise<T>) => {
    suspended.current += 1;
    try {
      return await fn();
    } finally {
      suspended.current -= 1;
    }
  }, []);

  const lockNow = useCallback(() => {
    clearImageCache();
    setLocked(true);
  }, []);

  const unlock = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        setDeviceUnprotected(true);
      } else {
        // The PIN fallback opens a separate system screen, which backgrounds the app.
        const result = await withoutLocking(() =>
          LocalAuthentication.authenticateAsync({
            promptMessage: 'Desbloquear DocBolso',
            cancelLabel: 'Cancelar',
          }),
        );
        if (!result.success) return;
      }
      setLocked(false);
      setEverUnlocked(true);
    } finally {
      authenticating.current = false;
    }
  }, [withoutLocking]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt.current = suspended.current > 0 ? null : Date.now();
      } else if (state === 'active' && backgroundAt.current !== null) {
        if (Date.now() - backgroundAt.current > LOCK_GRACE_MS) lockNow();
        backgroundAt.current = null;
      }
    });
    return () => sub.remove();
  }, [lockNow]);

  return (
    <LockContext.Provider
      value={{ locked, everUnlocked, deviceUnprotected, unlock, lockNow, withoutLocking }}
    >
      {children}
    </LockContext.Provider>
  );
}

export function useLock() {
  const ctx = useContext(LockContext);
  if (!ctx) throw new Error('useLock must be used inside LockProvider');
  return ctx;
}
