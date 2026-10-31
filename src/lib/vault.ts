// Encrypted on-device storage.
//
// A random AES-256 key lives in SecureStore (Android Keystore / iOS Keychain).
// The item index and every photo are stored as AES-GCM sealed files in the
// app's private document directory, so nothing readable ever touches disk.
//
// The index is never overwritten in place: a new version is written to
// index.tmp, verified, and swapped in with renames, keeping the previous one as
// index.prev. Readers try index → tmp → prev, so a crash at any point still
// leaves a readable copy.

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
// `File.move` rewrites the instance's uri, so build a fresh object per use.
const INDEX = 'index.enc';
const INDEX_TMP = 'index.tmp';
const INDEX_PREV = 'index.prev';
const vaultFile = (name: string) => new File(vaultDir, name);
const INDEX_CANDIDATES = [INDEX, INDEX_TMP, INDEX_PREV];

/** Where expo-image-picker leaves picked/cropped photos, unencrypted. */
const pickerCacheDir = new Directory(Paths.cache, 'ImagePicker');

const EMPTY: VaultData = {
  version: 1,
  items: [],
  settings: { blockScreenshots: true, lockGraceMs: 30_000 },
};

let keyPromise: Promise<AESEncryptionKey> | null = null;

async function loadKey(): Promise<AESEncryptionKey> {
  const stored = await SecureStore.getItemAsync(KEY_NAME);
  if (stored) return AESEncryptionKey.import(stored, 'hex');
  if (INDEX_CANDIDATES.some((name) => vaultFile(name).exists)) {
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

function parseIndex(plain: Uint8Array): VaultData {
  const data = JSON.parse(utf8Decode(plain)) as VaultData;
  if (!data || !Array.isArray(data.items)) throw new Error('Índice inválido');
  return { ...EMPTY, ...data, settings: { ...EMPTY.settings, ...data.settings } };
}

export async function readVault(): Promise<VaultData> {
  clearPickerCache();
  let lastError: unknown = null;
  for (const name of INDEX_CANDIDATES) {
    const file = vaultFile(name);
    if (!file.exists) continue;
    try {
      const data = parseIndex(await open(file));
      // Recovered from a fallback: make it the main index again right away, so
      // the next write doesn't rotate the broken file into index.prev.
      if (name !== INDEX) await writeVault(data);
      removeOrphanImages(data);
      return data;
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) {
    throw new Error('Os dados salvos estão corrompidos e não puderam ser lidos.');
  }
  await getKey(); // create the key up front so a later failure is detectable
  return { ...EMPTY, settings: { ...EMPTY.settings } };
}

export async function writeVault(data: VaultData): Promise<void> {
  ensureDir();
  const tmp = vaultFile(INDEX_TMP);
  await tmp.write(await seal(utf8Encode(JSON.stringify(data))));
  parseIndex(await open(vaultFile(INDEX_TMP))); // read back before trusting it
  const current = vaultFile(INDEX);
  if (current.exists) await current.move(vaultFile(INDEX_PREV), { overwrite: true });
  await vaultFile(INDEX_TMP).move(vaultFile(INDEX), { overwrite: true });
}

/**
 * Erases the whole vault and its key. Only for when the data can no longer be
 * read (lost key or corrupted index); a fresh empty vault is created on the
 * next readVault.
 */
export async function resetVault(): Promise<void> {
  imageCache.clear();
  if (vaultDir.exists) vaultDir.delete();
  await SecureStore.deleteItemAsync(KEY_NAME);
  keyPromise = null;
}

/** Deletes encrypted photos the index no longer references (failed saves, crashes). */
function removeOrphanImages(data: VaultData) {
  if (!vaultDir.exists) return;
  const referenced = new Set(data.items.flatMap((item) => item.images.map((img) => `${img.id}.enc`)));
  for (const entry of vaultDir.list()) {
    if (!(entry instanceof File) || INDEX_CANDIDATES.includes(entry.name)) continue;
    if (!entry.name.endsWith('.enc') || referenced.has(entry.name)) continue;
    try {
      entry.delete();
    } catch {
      // try again next launch
    }
  }
}

/** Deletes every unencrypted photo the image picker left in the cache. */
export function clearPickerCache() {
  try {
    if (pickerCacheDir.exists) pickerCacheDir.delete();
  } catch {
    // best effort; the OS may also clear the cache
  }
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
