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
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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
/** Where expo-image-manipulator writes thumbnails before they are sealed. */
const manipulatorCacheDir = new Directory(Paths.cache, 'ImageManipulator');

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
  try {
    // Thumbnails are deleted right after sealing; this only catches a crash in between.
    if (manipulatorCacheDir.exists) manipulatorCacheDir.delete();
  } catch {
    // best effort
  }
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
  clearImageCache();
  if (vaultDir.exists) vaultDir.delete();
  await SecureStore.deleteItemAsync(KEY_NAME);
  keyPromise = null;
}

/** Deletes encrypted photos the index no longer references (failed saves, crashes). */
function removeOrphanImages(data: VaultData) {
  if (!vaultDir.exists) return;
  const referenced = new Set(
    data.items.flatMap((item) => item.images.flatMap((img) => [`${img.id}.enc`, `${img.id}.thumb.enc`])),
  );
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

function thumbFile(id: string) {
  return new File(vaultDir, `${id}.thumb.enc`);
}

/** Thumbnail width in pixels: enough for the list's 56dp tiles on a 3x screen, with room to spare. */
const THUMB_WIDTH = 240;

/**
 * Renders a small JPEG of the image at `source` (file or data URI). The
 * manipulator can only save to the cache, so the plain file is read back and
 * deleted at once.
 */
async function renderThumb(source: string): Promise<Uint8Array> {
  const context = ImageManipulator.manipulate(source, { maxWidth: THUMB_WIDTH * 2 });
  context.resize({ width: THUMB_WIDTH, height: null });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.6 });
  const out = new File(result.uri);
  try {
    return await out.bytes();
  } finally {
    try {
      out.delete();
    } catch {
      // the cache is cleared with the picker cache
    }
  }
}

async function writeThumb(id: string, source: string) {
  try {
    await thumbFile(id).write(await seal(await renderThumb(source)));
  } catch {
    // no thumbnail: the list falls back to the full photo
  }
}

/** Encrypts a picked photo (and a thumbnail of it) into the vault. The source file is deleted. */
export async function importImage(uri: string, width: number, height: number): Promise<ImageRef> {
  ensureDir();
  const source = new File(uri);
  const id = randomUUID();
  await imageFile(id).write(await seal(await source.bytes()));
  await writeThumb(id, uri);
  try {
    source.delete();
  } catch {
    // picker cache; the OS cleans it up eventually
  }
  return { id, width, height };
}

/** A photo's plain bytes, for the backup. */
export async function readImageBytes(id: string): Promise<Uint8Array> {
  return open(imageFile(id));
}

/** Seals plain photo bytes into the vault under `id` (restoring a backup). */
export async function writeImageBytes(id: string, bytes: Uint8Array): Promise<void> {
  ensureDir();
  await imageFile(id).write(await seal(bytes));
}

export function hasImage(id: string): boolean {
  return imageFile(id).exists;
}

const imageCache = new Map<string, string>();
const thumbCache = new Map<string, string>();
const thumbsInFlight = new Map<string, Promise<string>>();

async function decryptToDataUri(file: File): Promise<string> {
  const sealed = AESSealedData.fromCombined(await file.bytes());
  const base64 = await aesDecryptAsync(sealed, await getKey(), { output: 'base64' });
  return `data:image/jpeg;base64,${base64}`;
}

/** Decrypts a photo into a data URI (memory only). */
export async function loadImage(id: string): Promise<string> {
  const cached = imageCache.get(id);
  if (cached) return cached;
  const uri = await decryptToDataUri(imageFile(id));
  imageCache.set(id, uri);
  return uri;
}

/**
 * Decrypts a photo's thumbnail into a data URI. Photos saved before thumbnails
 * existed (or restored from a backup) get one made from the full photo on
 * first use, without the full photo ever touching disk.
 */
export function loadThumbnail(id: string): Promise<string> {
  const cached = thumbCache.get(id);
  if (cached) return Promise.resolve(cached);
  let pending = thumbsInFlight.get(id);
  if (!pending) {
    pending = (async () => {
      if (!thumbFile(id).exists) {
        const hadFull = imageCache.has(id);
        await writeThumb(id, await loadImage(id));
        if (!thumbFile(id).exists) return loadImage(id); // couldn't make one
        if (!hadFull) imageCache.delete(id); // don't keep the big one around for the list
      }
      const uri = await decryptToDataUri(thumbFile(id));
      thumbCache.set(id, uri);
      return uri;
    })().finally(() => thumbsInFlight.delete(id));
    thumbsInFlight.set(id, pending);
  }
  return pending;
}

export function deleteImage(id: string) {
  imageCache.delete(id);
  thumbCache.delete(id);
  for (const file of [imageFile(id), thumbFile(id)]) {
    if (file.exists) file.delete();
  }
}

/** Drops decrypted photos from memory (called when the app locks). */
export function clearImageCache() {
  imageCache.clear();
  thumbCache.clear();
}
