import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useLock } from '../lib/lock';
import { useVault } from '../lib/store';
import { useTheme } from '../lib/theme';

const GRACE_OPTIONS = [
  { ms: 0, label: 'Na hora' },
  { ms: 30_000, label: '30 s' },
  { ms: 60_000, label: '1 min' },
  { ms: 300_000, label: '5 min' },
];

function graceText(ms: number) {
  if (ms === 0) return 'sempre que sai da tela';
  if (ms < 60_000) return `quando fica mais de ${ms / 1000} segundos em segundo plano`;
  const min = ms / 60_000;
  return `quando fica mais de ${min} ${min === 1 ? 'minuto' : 'minutos'} em segundo plano`;
}

export default function Settings() {
  const t = useTheme();
  const { data, updateSettings } = useVault();
  const { lockNow } = useLock();
  const block = data?.settings.blockScreenshots ?? true;
  const grace = data?.settings.lockGraceMs ?? 30_000;
  const lastBackup = data?.settings.lastBackupAt;

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

      <View style={[styles.card, { backgroundColor: t.card, borderColor: t.border, flexDirection: 'column', alignItems: 'stretch' }]}>
        <Text style={[styles.title, { color: t.text }]}>Trancar depois de</Text>
        <Text style={{ color: t.muted, marginTop: 2 }}>Tempo fora do app até pedir a digital de novo.</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {GRACE_OPTIONS.map((opt) => {
            const selected = grace === opt.ms;
            return (
              <Pressable
                key={opt.ms}
                onPress={() => updateSettings({ lockGraceMs: opt.ms })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[
                  styles.chip,
                  { borderColor: selected ? t.primary : t.border, backgroundColor: selected ? t.primary : 'transparent' },
                ]}
              >
                <Text style={{ color: selected ? t.onPrimary : t.text }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/backup')}
        style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Backup</Text>
          <Text style={{ color: lastBackup ? t.muted : t.danger, marginTop: 2 }}>
            {lastBackup
              ? `Último backup em ${new Date(lastBackup).toLocaleDateString('pt-BR')}`
              : 'Nenhum backup feito ainda'}
          </Text>
        </View>
        <Text style={{ color: t.muted, fontSize: 20 }}>›</Text>
      </Pressable>

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
          • O app tranca {graceText(grace)}.{'\n'}
          • Textos copiados são apagados da área de transferência depois de 1 minuto.{'\n'}
          • Se você desinstalar o app ou limpar os dados dele, tudo é apagado. Faça backups de
          vez em quando e guarde o código de recuperação.
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
});
