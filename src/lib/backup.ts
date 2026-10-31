// Encrypted backup file (.docbolso).
//
// Protected by a random 125-bit recovery code instead of a user password: with
// that much entropy no slow key stretching is needed, so the key is a plain
// HKDF of the code. (A password would need ~600k PBKDF2 rounds, which takes
// over a minute in JS on a phone; expo-crypto has no native KDF.)
//
// Layout:
//   MAGIC (16 bytes) | VERSION (1 byte) | salt (16 bytes)
//   then records: length (u32 big-endian) | AES-GCM sealed bytes
//   record 0 is the JSON index; record i (i ≥ 1) is photo index.imageIds[i-1].
// Each record's additional data is the header plus its record number, so
// records can't be swapped, reordered or moved into another backup.

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import type { Item } from './types';
import { utf8Decode, utf8Encode } from './utf8';
import { readImageBytes } from './vault';

const MAGIC = utf8Encode('DOCBOLSO-BACKUP\n');
const VERSION = 1;
const HEADER_LENGTH = MAGIC.length + 1 + 16;
const INFO = utf8Encode('docbolso-backup-v1');

/** Crockford base32: no I, L, O, U, so the code is hard to misread. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 25;

export const BACKUP_EXTENSION = 'docbolso';
const exportDir = new Directory(Paths.cache, 'backup');

interface BackupIndex {
  createdAt: number;
  items: Item[];
  imageIds: string[];
}

export interface RestoredBackup {
  items: Item[];
  /** Photos in the backup, read one at a time so a large backup doesn't fill memory. */
  readImages: (onImage: (id: string, bytes: Uint8Array) => Promise<void>) => Promise<void>;
}

/** A new random recovery code, e.g. "K7QM2-9XHTA-P4WRD-3NVEB-6YJCF". */
export function generateBackupCode(): string {
  // 256 is a multiple of 32, so masking each byte keeps the letters uniform.
  const chars = Array.from(getRandomBytes(CODE_LENGTH), (b) => ALPHABET[b & 31]);
  return formatCode(chars.join(''));
}

/** Uppercases, drops separators and fixes look-alike letters. Returns null if it isn't a code. */
export function normalizeCode(input: string): string | null {
  const raw = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (raw.length !== CODE_LENGTH || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return formatCode(raw);
}

function formatCode(raw: string) {
  return raw.match(/.{1,5}/g)!.join('-');
}

async function deriveKey(code: string, salt: Uint8Array) {
  const bytes = hkdf(sha256, utf8Encode(code), salt, INFO, 32);
  return AESEncryptionKey.import(bytes);
}

function additionalData(header: Uint8Array, record: number) {
  const ad = new Uint8Array(header.length + 4);
  ad.set(header);
  new DataView(ad.buffer).setUint32(header.length, record);
  return ad;
}

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

/** Deletes backup files left from earlier exports (they are encrypted, but no need to keep them). */
export function clearExports() {
  try {
    if (exportDir.exists) exportDir.delete();
  } catch {
    // best effort
  }
}

/** Writes an encrypted backup of `items` to a cache file and returns it. */
export async function writeBackup(items: Item[], code: string): Promise<File> {
  clearExports();
  exportDir.create({ intermediates: true, idempotent: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(exportDir, `docbolso-${date}.${BACKUP_EXTENSION}`);
  file.create({ overwrite: true });

  const salt = getRandomBytes(16);
  const header = new Uint8Array(HEADER_LENGTH);
  header.set(MAGIC);
  header[MAGIC.length] = VERSION;
  header.set(salt, MAGIC.length + 1);
  const key = await deriveKey(code, salt);

  const index: BackupIndex = {
    createdAt: Date.now(),
    items,
    imageIds: items.flatMap((item) => item.images.map((img) => img.id)),
  };

  const handle = file.open(FileMode.Truncate);
  try {
    await handle.writeBytes(header);
    const writeRecord = async (record: number, plain: Uint8Array) => {
      const sealed = await aesEncryptAsync(plain, key, { additionalData: additionalData(header, record) });
      const bytes = await sealed.combined('bytes');
      await handle.writeBytes(u32(bytes.length));
      await handle.writeBytes(bytes);
    };
    await writeRecord(0, utf8Encode(JSON.stringify(index)));
    for (let i = 0; i < index.imageIds.length; i++) {
      await writeRecord(i + 1, await readImageBytes(index.imageIds[i]));
    }
  } finally {
    handle.close();
  }
  return file;
}

export class WrongCodeError extends Error {
  constructor() {
    super('O código não abre este backup. Confira se digitou o código certo.');
  }
}

/** Opens a backup file. Throws WrongCodeError if the code doesn't match. */
export async function openBackup(uri: string, code: string): Promise<RestoredBackup> {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);
  const close = () => {
    try {
      handle.close();
    } catch {
      // already closed
    }
  };

  try {
    const header = await handle.readBytes(HEADER_LENGTH);
    const magicOk = header.length === HEADER_LENGTH && MAGIC.every((b, i) => header[i] === b);
    if (!magicOk) throw new Error('Este arquivo não é um backup do DocBolso.');
    if (header[MAGIC.length] !== VERSION) {
      throw new Error('Este backup foi feito por uma versão mais nova do app. Atualize o DocBolso.');
    }
    const key = await deriveKey(code, header.slice(MAGIC.length + 1));

    const readRecord = async (record: number) => {
      const lengthBytes = await handle.readBytes(4);
      if (lengthBytes.length !== 4) throw new Error('O backup está incompleto.');
      const length = new DataView(lengthBytes.buffer, lengthBytes.byteOffset).getUint32(0);
      const bytes = await handle.readBytes(length);
      if (bytes.length !== length) throw new Error('O backup está incompleto.');
      return aesDecryptAsync(AESSealedData.fromCombined(bytes), key, {
        additionalData: additionalData(header, record),
      });
    };

    let index: BackupIndex;
    try {
      index = JSON.parse(utf8Decode(await readRecord(0))) as BackupIndex;
    } catch (e) {
      if (e instanceof Error && e.message === 'O backup está incompleto.') throw e;
      throw new WrongCodeError(); // GCM authentication fails on a wrong key
    }
    if (!Array.isArray(index.items) || !Array.isArray(index.imageIds)) {
      throw new Error('O backup está corrompido.');
    }

    return {
      items: index.items,
      readImages: async (onImage) => {
        try {
          for (let i = 0; i < index.imageIds.length; i++) {
            await onImage(index.imageIds[i], await readRecord(i + 1));
          }
        } finally {
          close();
        }
      },
    };
  } catch (e) {
    close();
    throw e;
  }
}
