// Encrypted on-device storage.
//
// A random AES-256 key lives in SecureStore (Android Keystore / iOS Keychain).
// The item index and every photo are stored as AES-GCM sealed files in the
// app's private document directory, so nothing readable ever touches disk.

import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  randomUUID,
} from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import type { ImageRef, VaultData } from './types';
import { utf8Decode, utf8Encode } from './utf8';

const KEY_NAME = 'docbolso.vault-key';
const vaultDir = new Directory(Paths.document, 'vault');
const indexFile = new File(vaultDir, 'index.enc');

const EMPTY: VaultData = {
  version: 1,
  items: [],
  settings: { blockScreenshots: true },
};

let keyPromise: Promise<AESEncryptionKey> | null = null;

async function loadKey(): Promise<AESEncryptionKey> {
  const stored = await SecureStore.getItemAsync(KEY_NAME);
  if (stored) return AESEncryptionKey.import(stored, 'hex');
  if (indexFile.exists) {
    throw new Error('A chave de criptografia sumiu; os dados salvos não podem ser lidos.');
  }
  const key = await AESEncryptionKey.generate();
  await SecureStore.setItemAsync(KEY_NAME, await key.encoded('hex'), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

function getKey(): Promise<AESEncryptionKey> {
  keyPromise ??= loadKey().catch((e) => {
    keyPromise = null;
    throw e;
  });
  return keyPromise;
}

function ensureDir() {
  vaultDir.create({ intermediates: true, idempotent: true });
}

async function seal(plain: Uint8Array): Promise<Uint8Array> {
  const sealed = await aesEncryptAsync(plain, await getKey());
  return sealed.combined('bytes');
}

async function open(file: File): Promise<Uint8Array> {
  const sealed = AESSealedData.fromCombined(await file.bytes());
  return aesDecryptAsync(sealed, await getKey());
}

export async function readVault(): Promise<VaultData> {
  if (!indexFile.exists) {
    await getKey(); // create the key up front so a later failure is detectable
    return { ...EMPTY, settings: { ...EMPTY.settings } };
  }
  const data = JSON.parse(utf8Decode(await open(indexFile))) as VaultData;
  return { ...EMPTY, ...data, settings: { ...EMPTY.settings, ...data.settings } };
}

export async function writeVault(data: VaultData): Promise<void> {
  ensureDir();
  await indexFile.write(await seal(utf8Encode(JSON.stringify(data))));
}

function imageFile(id: string) {
  return new File(vaultDir, `${id}.enc`);
}

/** Encrypts a picked photo into the vault. The source file is deleted. */
export async function importImage(uri: string, width: number, height: number): Promise<ImageRef> {
  ensureDir();
  const source = new File(uri);
  const id = randomUUID();
  await imageFile(id).write(await seal(await source.bytes()));
  try {
    source.delete();
  } catch {
    // picker cache; the OS cleans it up eventually
  }
  return { id, width, height };
}

const imageCache = new Map<string, string>();

/** Decrypts a photo into a data URI (memory only). */
export async function loadImage(id: string): Promise<string> {
  const cached = imageCache.get(id);
  if (cached) return cached;
  const sealed = AESSealedData.fromCombined(await imageFile(id).bytes());
  const base64 = await aesDecryptAsync(sealed, await getKey(), { output: 'base64' });
  const uri = `data:image/jpeg;base64,${base64}`;
  imageCache.set(id, uri);
  return uri;
}

export function deleteImage(id: string) {
  imageCache.delete(id);
  const file = imageFile(id);
  if (file.exists) file.delete();
}

/** Drops decrypted photos from memory (called when the app locks). */
export function clearImageCache() {
  imageCache.clear();
}
