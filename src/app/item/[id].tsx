import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { EncryptedImage } from '../../components/EncryptedImage';
import { QrCode, wifiPayload } from '../../components/QrCode';
import { useMaxBrightness } from '../../lib/brightness';
import { copyPrivate } from '../../lib/clipboard';
import { expiryStatus, expiryText, formatBrDate } from '../../lib/dates';
import { useItem, useVault } from '../../lib/store';
import { type Theme, useTheme } from '../../lib/theme';

function CopyRow({ label, value, secret, t }: { label: string; value: string; secret?: boolean; t: Theme }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await copyPrivate(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={[styles.copyRow, { backgroundColor: t.card, borderColor: t.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.muted, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: t.text, fontSize: 17, marginTop: 2 }} selectable={shown}>
          {shown ? value : '••••••••'}
        </Text>
      </View>
      {secret && (
        <Pressable
          onPress={() => setShown((v) => !v)}
          hitSlop={8}
          style={styles.copyBtn}
          accessibilityRole="button"
          accessibilityLabel={`${shown ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`}
        >
          <Text style={{ color: t.primary }}>{shown ? 'Ocultar' : 'Mostrar'}</Text>
        </Pressable>
      )}
      <Pressable
        onPress={copy}
        hitSlop={8}
        style={styles.copyBtn}
        accessibilityRole="button"
        accessibilityLabel={`Copiar ${label.toLowerCase()}`}
      >
        <Text style={{ color: t.primary, fontWeight: '600' }}>{copied ? 'Copiado!' : 'Copiar'}</Text>
      </Pressable>
    </View>
  );
}

export default function ItemScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id);
  const { deleteItem } = useVault();
  useMaxBrightness(item?.kind === 'wifi');

  if (!item) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.muted }}>Item não encontrado.</Text>
      </View>
    );
  }

  const confirmDelete = () =>
    Alert.alert('Excluir', `Excluir "${item.title}"? Isso não pode ser desfeito.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          router.back();
          await deleteItem(item.id);
        },
      },
    ]);

  const contentWidth = width - 32;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 12 }}>
      <Stack.Screen
        options={{
          title: item.title,
          headerRight: () => (
            <Pressable
              hitSlop={12}
              onPress={() => router.push({ pathname: '/form', params: { id: item.id } })}
            >
              <Text style={{ color: t.primary, fontSize: 17, fontWeight: '600' }}>Editar</Text>
            </Pressable>
          ),
        }}
      />

      {item.kind === 'doc' &&
        item.images.map((img, index) => (
          <Pressable
            key={img.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Foto ${index + 1} de ${item.title}, abrir em tela cheia`}
            onPress={() => router.push({ pathname: '/viewer', params: { id: item.id, index: String(index) } })}
          >
            <EncryptedImage
              id={img.id}
              resizeMode="contain"
              style={{
                width: contentWidth,
                height: contentWidth * (img.height / img.width || 0.63),
                borderRadius: 10,
                backgroundColor: t.card,
              }}
            />
          </Pressable>
        ))}
      {item.kind === 'doc' && item.images.length > 0 && (
        <Text style={{ color: t.muted, textAlign: 'center', fontSize: 13 }}>
          Toque na foto para ver em tela cheia
        </Text>
      )}

      {item.kind === 'doc' && item.expiresOn && (
        <View style={[styles.copyRow, { backgroundColor: t.card, borderColor: t.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.muted, fontSize: 13 }}>Validade</Text>
            <Text style={{ color: t.text, fontSize: 17, marginTop: 2 }}>{formatBrDate(item.expiresOn)}</Text>
          </View>
          <Text
            style={{
              color: expiryStatus(item.expiresOn) === 'ok' ? t.muted : t.danger,
              fontWeight: expiryStatus(item.expiresOn) === 'ok' ? '400' : '600',
            }}
          >
            {expiryText(item.expiresOn)}
          </Text>
        </View>
      )}

      {item.kind === 'wifi' && (
        <>
          <View style={[styles.qrBox, { backgroundColor: '#fff' }]}>
            <QrCode
              value={wifiPayload(item.ssid ?? '', item.password ?? '', item.security ?? 'WPA')}
              size={Math.min(contentWidth - 32, 300)}
            />
            <Text style={styles.qrHint}>Aponte a câmera do outro celular para conectar</Text>
          </View>
          <CopyRow label="Rede" value={item.ssid ?? ''} t={t} />
          {item.security !== 'nopass' && <CopyRow label="Senha" value={item.password ?? ''} secret t={t} />}
        </>
      )}

      {item.kind === 'note' && item.note ? (
        <CopyRow label="Conteúdo" value={item.note} t={t} />
      ) : null}
      {item.kind !== 'note' && item.note ? <CopyRow label="Observações" value={item.note} t={t} /> : null}

      <Pressable onPress={confirmDelete} style={[styles.delete, { borderColor: t.danger }]}>
        <Text style={{ color: t.danger, fontWeight: '600' }}>Excluir</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  copyRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  copyBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  qrBox: { alignItems: 'center', padding: 16, borderRadius: 16 },
  qrHint: { color: '#444', marginTop: 10, fontSize: 14, textAlign: 'center' },
  delete: { marginTop: 24, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
});
