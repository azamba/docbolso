import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EncryptedImage } from '../components/EncryptedImage';
import { useLock } from '../lib/lock';
import { useItem, useVault } from '../lib/store';
import { type Theme, useTheme } from '../lib/theme';
import { KIND_LABEL, type ImageRef, type ItemKind, type WifiSecurity } from '../lib/types';
import { clearPickerCache, deleteImage, importImage } from '../lib/vault';

/** A photo already in the vault, or one just picked that is not encrypted yet. */
type Photo = { saved: ImageRef } | { pending: ImagePicker.ImagePickerAsset };

const PHOTO_LABELS = ['Frente', 'Verso'];
const MAX_PHOTOS = 6;

export default function Form() {
  const t = useTheme();
  const params = useLocalSearchParams<{ kind?: ItemKind; id?: string }>();
  const existing = useItem(params.id);
  const kind: ItemKind = existing?.kind ?? params.kind ?? 'doc';
  const { saveItem } = useVault();
  const { withoutLocking } = useLock();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [ssid, setSsid] = useState(existing?.ssid ?? '');
  const [password, setPassword] = useState(existing?.password ?? '');
  const [security, setSecurity] = useState<WifiSecurity>(existing?.security ?? 'WPA');
  const [photos, setPhotos] = useState<Photo[]>(
    () => existing?.images.map((saved) => ({ saved })) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  const original = existing?.images ?? [];
  const dirty =
    title !== (existing?.title ?? '') ||
    note !== (existing?.note ?? '') ||
    ssid !== (existing?.ssid ?? '') ||
    password !== (existing?.password ?? '') ||
    security !== (existing?.security ?? 'WPA') ||
    photos.length !== original.length ||
    photos.some((p, i) => !('saved' in p) || p.saved.id !== original[i].id);

  // While saving, the screen navigates away on purpose.
  usePreventRemove(dirty && !saving && !discarded, ({ repeat }) =>
    Alert.alert('Descartar alterações?', 'O que você mudou não foi salvo.', [
      { text: 'Continuar editando', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: () => {
          setDiscarded(true);
          repeat();
        },
      },
    ]),
  );

  // Picked photos sit unencrypted in the picker cache until saved; never leave
  // them behind, whether the form was saved or abandoned.
  useEffect(() => clearPickerCache, []);

  const pick = async (source: 'camera' | 'library') => {
    const result = await withoutLocking(async () => {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Câmera', 'Permita o acesso à câmera nas configurações do Android.');
          return null;
        }
        return ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
      }
      return ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: true });
    });
    if (result && !result.canceled) {
      setPhotos((p) => [...p, { pending: result.assets[0] }]);
    }
  };

  const save = async () => {
    const finalTitle = title.trim() || (kind === 'wifi' ? ssid.trim() : '');
    if (!finalTitle) {
      Alert.alert('Falta o nome', 'Dê um nome para o item.');
      return;
    }
    if (kind === 'wifi' && !ssid.trim()) {
      Alert.alert('Falta a rede', 'Informe o nome da rede Wi-Fi.');
      return;
    }
    setSaving(true);
    const imported: ImageRef[] = [];
    try {
      const images: ImageRef[] = [];
      for (const p of photos) {
        if ('saved' in p) {
          images.push(p.saved);
        } else {
          const ref = await importImage(p.pending.uri, p.pending.width, p.pending.height);
          imported.push(ref);
          images.push(ref);
        }
      }
      const saved = await saveItem(
        {
          kind,
          title: finalTitle,
          note: note.trim(),
          images,
          ...(kind === 'wifi' ? { ssid: ssid.trim(), password, security } : {}),
        },
        existing?.id,
      );
      // Only drop removed photos once the new index is safely written.
      const kept = new Set(images.map((i) => i.id));
      existing?.images.filter((i) => !kept.has(i.id)).forEach((i) => deleteImage(i.id));
      if (existing) router.back();
      else router.replace({ pathname: '/item/[id]', params: { id: saved.id } });
    } catch (e) {
      // importImage deleted the picked files, so swap the photos that were
      // already encrypted into the form; a retry reuses them, and if the form
      // is abandoned the vault drops them as orphans on the next launch.
      let n = 0;
      setPhotos((ps) =>
        ps.map((p) => ('pending' in p && n < imported.length ? { saved: imported[n++] } : p)),
      );
      Alert.alert('Erro ao salvar', (e as Error).message);
      setSaving(false);
    }
  };

  const s = makeStyles(t);
  const titlePlaceholder =
    kind === 'doc' ? 'Ex.: CNH, RG, Plano de saúde' : kind === 'wifi' ? 'Ex.: Wi-Fi de casa' : 'Ex.: Placa do carro';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Stack.Screen
        options={{
          title: `${existing ? 'Editar' : 'Novo'} ${KIND_LABEL[kind].toLowerCase()}`,
          headerRight: () =>
            saving ? (
              <ActivityIndicator />
            ) : (
              <Pressable onPress={save} hitSlop={12}>
                <Text style={{ color: t.primary, fontSize: 17, fontWeight: '600' }}>Salvar</Text>
              </Pressable>
            ),
        }}
      />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Nome</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={titlePlaceholder}
          placeholderTextColor={t.muted}
          style={s.input}
          autoFocus={!existing}
        />

        {kind === 'doc' && (
          <>
            <Text style={s.label}>Fotos</Text>
            <View style={s.photos}>
              {photos.map((p, i) => (
                <View key={'saved' in p ? p.saved.id : p.pending.uri} style={s.photoBox}>
                  {'saved' in p ? (
                    <EncryptedImage id={p.saved.id} style={s.photo} />
                  ) : (
                    <Image source={{ uri: p.pending.uri }} style={s.photo} />
                  )}
                  <Text style={s.photoLabel}>{PHOTO_LABELS[i] ?? `Foto ${i + 1}`}</Text>
                  <Pressable
                    style={s.remove}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover ${PHOTO_LABELS[i]?.toLowerCase() ?? `foto ${i + 1}`}`}
                    onPress={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            {photos.length < MAX_PHOTOS && (
              <View style={s.row}>
                <Pressable style={s.secondary} onPress={() => pick('camera')}>
                  <Text style={s.secondaryText}>📷 Câmera</Text>
                </Pressable>
                <Pressable style={s.secondary} onPress={() => pick('library')}>
                  <Text style={s.secondaryText}>🖼️ Galeria</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {kind === 'wifi' && (
          <>
            <Text style={s.label}>Nome da rede (SSID)</Text>
            <TextInput
              value={ssid}
              onChangeText={setSsid}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={s.label}>Segurança</Text>
            <View style={s.row}>
              {(['WPA', 'WEP', 'nopass'] as const).map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => setSecurity(opt)}
                  style={[s.chip, security === opt && { backgroundColor: t.primary, borderColor: t.primary }]}
                >
                  <Text style={{ color: security === opt ? t.onPrimary : t.text }}>
                    {opt === 'WPA' ? 'WPA/WPA2/WPA3' : opt === 'WEP' ? 'WEP' : 'Aberta'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {security !== 'nopass' && (
              <>
                <Text style={s.label}>Senha</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  style={s.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}
          </>
        )}

        <Text style={s.label}>{kind === 'note' ? 'Conteúdo' : 'Observações'}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder={kind === 'doc' ? 'Número, validade, órgão emissor…' : ''}
          placeholderTextColor={t.muted}
          style={[s.input, { minHeight: kind === 'note' ? 160 : 90, textAlignVertical: 'top' }]}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    content: { padding: 16, paddingBottom: 48 },
    label: { color: t.muted, fontSize: 13, fontWeight: '600', marginTop: 18, marginBottom: 6, textTransform: 'uppercase' },
    input: {
      backgroundColor: t.input,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: t.text,
    },
    photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    photoBox: { width: '47%' },
    photo: { width: '100%', aspectRatio: 1.58, borderRadius: 8, backgroundColor: t.card },
    photoLabel: { color: t.muted, fontSize: 13, marginTop: 4 },
    remove: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
    secondary: {
      flex: 1,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: t.card,
    },
    secondaryText: { color: t.text, fontSize: 15, fontWeight: '500' },
    chip: { borderColor: t.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  });
