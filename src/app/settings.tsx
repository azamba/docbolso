import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useLock } from '../lib/lock';
import { useVault } from '../lib/store';
import { useTheme } from '../lib/theme';

export default function Settings() {
  const t = useTheme();
  const { data, updateSettings } = useVault();
  const { lockNow } = useLock();
  const block = data?.settings.blockScreenshots ?? true;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Bloquear prints</Text>
          <Text style={{ color: t.muted, marginTop: 2 }}>
            Impede capturas de tela e esconde o conteúdo na lista de apps recentes.
          </Text>
        </View>
        <Switch value={block} onValueChange={(v) => updateSettings({ blockScreenshots: v })} />
      </View>

      <Pressable
        onPress={() => {
          router.dismissAll();
          lockNow();
        }}
        style={[styles.button, { backgroundColor: t.primary }]}
      >
        <Text style={{ color: t.onPrimary, fontWeight: '600', fontSize: 16 }}>Trancar agora</Text>
      </Pressable>

      <View style={[styles.info, { borderColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>Sobre a segurança</Text>
        <Text style={[styles.body, { color: t.muted }]}>
          • Tudo fica só neste celular, sem nuvem.{'\n'}
          • Fotos e dados são criptografados (AES-256) com uma chave guardada no chip de
          segurança do Android.{'\n'}
          • O app tranca quando fica mais de 30 segundos em segundo plano.{'\n'}
          • Atenção: se você desinstalar o app ou limpar os dados dele, tudo é apagado. Não há
          backup.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  info: { padding: 16, borderRadius: 14, borderWidth: 1 },
  body: { marginTop: 8, lineHeight: 22 },
});
