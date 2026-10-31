import { Link, Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncryptedImage } from '../components/EncryptedImage';
import { expiryStatus, expiryText } from '../lib/dates';
import { useLock } from '../lib/lock';
import { useVault } from '../lib/store';
import { useTheme } from '../lib/theme';
import { KIND_ICON, type Item, type ItemKind } from '../lib/types';

/** Shown when the vault can't be read: retry, or erase everything as a last resort. */
function VaultError({ message }: { message: string }) {
  const t = useTheme();
  const { reload, eraseAll } = useVault();
  const confirmErase = () =>
    Alert.alert(
      'Apagar tudo?',
      'Todos os documentos, notas e senhas salvos neste app serão apagados para sempre. Use só se tentar de novo não resolver.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar tudo',
          style: 'destructive',
          onPress: () => eraseAll().catch((e: Error) => Alert.alert('Erro', e.message)),
        },
      ],
    );
  return (
    <View style={{ padding: 24, gap: 12, marginTop: 24 }}>
      <Text style={[styles.empty, { color: t.danger, marginTop: 0 }]}>{message}</Text>
      <Pressable onPress={reload} style={[styles.addBtn, { backgroundColor: t.primary, flex: 0 }]}>
        <Text style={[styles.addText, { color: t.onPrimary }]}>Tentar de novo</Text>
      </Pressable>
      <Pressable onPress={confirmErase} style={[styles.addBtn, { borderColor: t.danger, borderWidth: 1, flex: 0 }]}>
        <Text style={[styles.addText, { color: t.danger }]}>Apagar tudo e recomeçar</Text>
      </Pressable>
    </View>
  );
}

function subtitle(item: Item) {
  if (item.kind === 'wifi') return item.ssid ?? '';
  if (item.kind === 'doc') {
    const n = item.images.length;
    const photos = n === 0 ? 'sem fotos' : n === 1 ? '1 foto' : `${n} fotos`;
    return item.note ? `${photos} · ${item.note.split('\n')[0]}` : photos;
  }
  return item.note.split('\n')[0];
}

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { data, error } = useVault();
  const { deviceUnprotected } = useLock();
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items ?? [])
      .filter((i) => !q || `${i.title} ${i.note} ${i.ssid ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  }, [data, query]);

  const add = (kind: ItemKind) => router.push({ pathname: '/form', params: { kind } });

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable hitSlop={12} accessibilityRole="button" accessibilityLabel="Ajustes">
                <Text style={{ fontSize: 22 }}>⚙️</Text>
              </Pressable>
            </Link>
          ),
        }}
      />

      {deviceUnprotected && (
        <Text style={[styles.warn, { color: t.danger, borderColor: t.danger }]}>
          Seu celular não tem PIN, padrão ou digital configurado, então o app não consegue se
          trancar. Configure um bloqueio de tela nas configurações do Android.
        </Text>
      )}

      {error ? (
        <VaultError message={error} />
      ) : !data ? (
        <ActivityIndicator style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            data.items.length > 3 ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar"
                placeholderTextColor={t.muted}
                style={[styles.search, { backgroundColor: t.input, borderColor: t.border, color: t.text }]}
              />
            ) : undefined
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.muted }]}>
              {query
                ? 'Nada encontrado.'
                : 'Nenhum item ainda.\nAdicione sua CNH, RG, carteirinha do plano ou a senha do Wi-Fi.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: t.card, borderColor: t.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              {item.kind === 'doc' && item.images[0] ? (
                <EncryptedImage id={item.images[0].id} style={styles.thumb} thumbnail />
              ) : (
                <View style={[styles.thumb, styles.iconBox, { backgroundColor: t.bg }]}>
                  <Text style={{ fontSize: 24 }}>{KIND_ICON[item.kind]}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={{ color: t.muted }} numberOfLines={1}>
                  {subtitle(item)}
                </Text>
                {item.expiresOn && expiryStatus(item.expiresOn) !== 'ok' && (
                  <Text style={{ color: t.danger, fontWeight: '600', fontSize: 13, marginTop: 2 }}>
                    {expiryText(item.expiresOn)}
                  </Text>
                )}
              </View>
            </Pressable>
          )}
        />
      )}

      <View
        style={[
          styles.bar,
          { paddingBottom: insets.bottom + 12, backgroundColor: t.card, borderColor: t.border },
        ]}
      >
        {(['doc', 'note', 'wifi'] as const).map((kind) => (
          <Pressable
            key={kind}
            onPress={() => add(kind)}
            disabled={!data}
            style={({ pressed }) => [styles.addBtn, { backgroundColor: t.primary, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.addText, { color: t.onPrimary }]}>
              ＋ {kind === 'doc' ? 'Documento' : kind === 'note' ? 'Nota' : 'Wi-Fi'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  warn: { margin: 16, marginBottom: 0, padding: 12, borderWidth: 1, borderRadius: 10 },
  search: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 15, lineHeight: 22, paddingHorizontal: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  thumb: { width: 56, height: 40, borderRadius: 6 },
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  addBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  addText: { fontWeight: '600', fontSize: 14 },
});
