import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { WrongCodeError, normalizeCode } from '../lib/backup';
import { copyPrivate } from '../lib/clipboard';
import { useLock } from '../lib/lock';
import { useVault } from '../lib/store';
import { type Theme, useTheme } from '../lib/theme';

type Busy = 'export' | 'restore' | null;

export default function Backup() {
  const t = useTheme();
  const s = makeStyles(t);
  const { data, ensureBackupCode, exportBackup, restoreBackup, updateSettings } = useVault();
  const { withoutLocking } = useLock();
  const [code, setCode] = useState<string | null>(data?.backupCode ?? null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [picked, setPicked] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [typedCode, setTypedCode] = useState('');

  useEffect(() => {
    if (!code) ensureBackupCode().then(setCode, (e: Error) => Alert.alert('Erro', e.message));
  }, [code, ensureBackupCode]);

  const lastBackup = data?.settings.lastBackupAt;

  const doExport = async () => {
    setBusy('export');
    try {
      const uri = await exportBackup();
      await withoutLocking(() =>
        Sharing.shareAsync(uri, { mimeType: 'application/octet-stream', dialogTitle: 'Salvar backup do DocBolso' }),
      );
      await updateSettings({ lastBackupAt: Date.now() });
    } catch (e) {
      Alert.alert('Erro no backup', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pickFile = async () => {
    const result = await withoutLocking(() =>
      DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true }),
    );
    if (!result.canceled) setPicked(result.assets[0]);
  };

  const doRestore = async () => {
    if (!picked) return;
    const normalized = normalizeCode(typedCode);
    if (!normalized) {
      Alert.alert('Código inválido', 'O código tem 25 letras e números, como K7QM2-9XHTA-P4WRD-3NVEB-6YJCF.');
      return;
    }
    setBusy('restore');
    try {
      const count = await restoreBackup(picked.uri, normalized);
      try {
        new File(picked.uri).delete(); // the picker's copy in the cache
      } catch {
        // the OS clears the cache eventually
      }
      setPicked(null);
      setTypedCode('');
      Alert.alert(
        'Backup restaurado',
        count === 0
          ? 'Tudo o que está no backup já estava no app.'
          : count === 1
            ? '1 item foi adicionado ou atualizado.'
            : `${count} itens foram adicionados ou atualizados.`,
      );
    } catch (e) {
      Alert.alert(e instanceof WrongCodeError ? 'Código errado' : 'Erro ao restaurar', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!code) return;
    await copyPrivate(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.title}>Código de recuperação</Text>
        <Text style={[s.code, { letterSpacing: shown ? 1 : 3 }]} selectable={shown}>
          {code ? (shown ? code : '•••••-•••••-•••••-•••••-•••••') : '…'}
        </Text>
        <View style={s.row}>
          <Pressable style={s.secondary} onPress={() => setShown((v) => !v)} accessibilityRole="button">
            <Text style={s.secondaryText}>{shown ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
          <Pressable style={s.secondary} onPress={copy} accessibilityRole="button" accessibilityLabel="Copiar código">
            <Text style={s.secondaryText}>{copied ? 'Copiado!' : 'Copiar'}</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>
          Guarde este código fora do celular (num gerenciador de senhas ou no papel). Sem ele, o
          backup não abre — nem por nós.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.title}>Fazer backup</Text>
        <Text style={s.hint}>
          Gera um arquivo criptografado com todos os itens e fotos. Salve no Google Drive, no
          computador ou mande para você mesmo.
          {lastBackup ? `\nÚltimo backup: ${new Date(lastBackup).toLocaleDateString('pt-BR')}.` : ''}
        </Text>
        <Pressable style={s.primary} onPress={doExport} disabled={busy !== null || !code}>
          {busy === 'export' ? (
            <ActivityIndicator color={t.onPrimary} />
          ) : (
            <Text style={s.primaryText}>Exportar backup</Text>
          )}
        </Pressable>
      </View>

      <View style={s.card}>
        <Text style={s.title}>Restaurar backup</Text>
        <Text style={s.hint}>
          Junta os itens do backup com os que já estão aqui. Nada é apagado; se o mesmo item existir
          nos dois, fica a versão editada por último.
        </Text>
        <Pressable style={s.secondary} onPress={pickFile} disabled={busy !== null}>
          <Text style={s.secondaryText} numberOfLines={1}>
            {picked ? `📄 ${picked.name}` : 'Escolher arquivo .docbolso'}
          </Text>
        </Pressable>
        {picked && (
          <>
            <TextInput
              value={typedCode}
              onChangeText={setTypedCode}
              placeholder="Código de recuperação do backup"
              placeholderTextColor={t.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={s.input}
            />
            <Pressable style={s.primary} onPress={doRestore} disabled={busy !== null}>
              {busy === 'restore' ? (
                <ActivityIndicator color={t.onPrimary} />
              ) : (
                <Text style={s.primaryText}>Restaurar</Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 16, paddingBottom: 48 },
    card: { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
    title: { color: t.text, fontSize: 16, fontWeight: '600' },
    code: { color: t.text, fontSize: 18, fontFamily: 'monospace', textAlign: 'center', paddingVertical: 4 },
    hint: { color: t.muted, lineHeight: 20 },
    row: { flexDirection: 'row', gap: 10 },
    primary: { backgroundColor: t.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    primaryText: { color: t.onPrimary, fontWeight: '600', fontSize: 16 },
    secondary: {
      flex: 1,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: 'center',
      backgroundColor: t.bg,
    },
    secondaryText: { color: t.text, fontSize: 15, fontWeight: '500' },
    input: {
      backgroundColor: t.input,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.text,
      fontFamily: 'monospace',
    },
  });
