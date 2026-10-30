import { useEffect } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLock } from '../lib/lock';
import { useTheme } from '../lib/theme';

/** Covers the whole app while it is locked, keeping navigation state underneath. */
export function LockOverlay() {
  const { locked, unlock } = useLock();
  const t = useTheme();

  useEffect(() => {
    if (!locked) return;
    if (AppState.currentState === 'active') unlock();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && unlock());
    return () => sub.remove();
  }, [locked, unlock]);

  if (!locked) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: t.bg }]}>
      <Text style={styles.icon}>🔒</Text>
      <Text style={[styles.title, { color: t.text }]}>DocBolso</Text>
      <Text style={[styles.sub, { color: t.muted }]}>Seus documentos estão protegidos</Text>
      <Pressable
        onPress={unlock}
        style={({ pressed }) => [styles.btn, { backgroundColor: t.primary, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[styles.btnText, { color: t.onPrimary }]}>Desbloquear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  sub: { fontSize: 15, marginTop: 6, marginBottom: 32 },
  btn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnText: { fontSize: 16, fontWeight: '600' },
});
