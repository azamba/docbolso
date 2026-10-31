import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { clearExports, generateBackupCode, openBackup, writeBackup } from './backup';
import { useLock } from './lock';
import type { Item, Settings, VaultData } from './types';
import { deleteImage, hasImage, readVault, resetVault, writeImageBytes, writeVault } from './vault';

export type ItemDraft = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;

interface VaultContextValue {
  data: VaultData | null;
  error: string | null;
  saveItem: (draft: ItemDraft, id?: string) => Promise<Item>;
  deleteItem: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** Erases everything and starts an empty vault (recovery when the data can't be read). */
  eraseAll: () => Promise<void>;
  /** Tries to read the vault again after an error. */
  reload: () => Promise<void>;
  /** The recovery code for backups, created on first call. */
  ensureBackupCode: () => Promise<string>;
  /** Writes an encrypted backup file and returns its uri. */
  exportBackup: () => Promise<string>;
  /** Merges a backup into the vault; returns how many items were added or updated. */
  restoreBackup: (uri: string, code: string) => Promise<number>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { everUnlocked } = useLock();
  const [data, setData] = useState<VaultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Latest committed state, plus a queue so two quick saves can't interleave.
  const latest = useRef<VaultData | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(
    () =>
      readVault()
        .then((loaded) => {
          latest.current = loaded;
          setError(null);
          setData(loaded);
        })
        .catch((e: Error) => setError(e.message)),
    [],
  );

  useEffect(() => {
    clearExports();
  }, []);

  useEffect(() => {
    if (everUnlocked && !latest.current) load();
  }, [everUnlocked, load]);

  const commit = useCallback((update: (current: VaultData) => VaultData) => {
    const run = queue.current.then(async () => {
      if (!latest.current) throw new Error('Cofre ainda não carregado');
      const next = update(latest.current);
      await writeVault(next);
      latest.current = next;
      setData(next);
    });
    queue.current = run.catch(() => {});
    return run;
  }, []);

  const saveItem = useCallback(
    async (draft: ItemDraft, id?: string) => {
      const now = Date.now();
      let saved!: Item;
      await commit((current) => {
        const existing = id ? current.items.find((i) => i.id === id) : undefined;
        saved = existing
          ? { ...existing, ...draft, updatedAt: now }
          : { ...draft, id: randomUUID(), createdAt: now, updatedAt: now };
        const items = existing
          ? current.items.map((i) => (i.id === id ? saved : i))
          : [...current.items, saved];
        return { ...current, items };
      });
      return saved;
    },
    [commit],
  );

  const deleteItem = useCallback(
    async (id: string) => {
      let removed: Item | undefined;
      await commit((current) => {
        removed = current.items.find((i) => i.id === id);
        return { ...current, items: current.items.filter((i) => i.id !== id) };
      });
      removed?.images.forEach((img) => deleteImage(img.id));
    },
    [commit],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) =>
      commit((current) => ({ ...current, settings: { ...current.settings, ...patch } })),
    [commit],
  );

  const eraseAll = useCallback(async () => {
    await queue.current;
    latest.current = null;
    setData(null);
    await resetVault();
    await load();
  }, [load]);

  const ensureBackupCode = useCallback(async () => {
    let code = latest.current?.backupCode;
    if (code) return code;
    await commit((current) => {
      code = current.backupCode ?? generateBackupCode();
      return current.backupCode ? current : { ...current, backupCode: code };
    });
    return code!;
  }, [commit]);

  const exportBackup = useCallback(async () => {
    const code = await ensureBackupCode();
    // Snapshot after pending writes, so the backup matches what is saved.
    await queue.current;
    const file = await writeBackup(latest.current!.items, code);
    return file.uri;
  }, [ensureBackupCode]);

  const restoreBackup = useCallback(
    async (uri: string, code: string) => {
      const backup = await openBackup(uri, code);
      const current = latest.current!;
      const localById = new Map(current.items.map((i) => [i.id, i]));
      // Same id on both sides: keep whichever was edited last.
      const incoming = backup.items.filter((item) => {
        const local = localById.get(item.id);
        return !local || item.updatedAt > local.updatedAt;
      });
      const wanted = new Set(incoming.flatMap((item) => item.images.map((img) => img.id)));

      // Photos first: if this stops halfway, the index is untouched and the
      // extra photos are dropped as orphans on the next launch.
      await backup.readImages(async (id, bytes) => {
        if (wanted.has(id) && !hasImage(id)) await writeImageBytes(id, bytes);
      });

      let replacedImages: string[] = [];
      await commit((now) => {
        const byId = new Map(now.items.map((i) => [i.id, i]));
        const replaced = incoming.flatMap((item) => byId.get(item.id)?.images ?? []);
        for (const item of incoming) byId.set(item.id, item);
        const kept = new Set([...byId.values()].flatMap((item) => item.images.map((img) => img.id)));
        replacedImages = replaced.map((img) => img.id).filter((id) => !kept.has(id));
        // Adopt the backup's code on a fresh install, so later backups open with the same code.
        return { ...now, items: [...byId.values()], backupCode: now.backupCode ?? code };
      });
      replacedImages.forEach(deleteImage);
      return incoming.length;
    },
    [commit],
  );

  return (
    <VaultContext.Provider
      value={{
        data,
        error,
        saveItem,
        deleteItem,
        updateSettings,
        eraseAll,
        reload: load,
        ensureBackupCode,
        exportBackup,
        restoreBackup,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside VaultProvider');
  return ctx;
}

export function useItem(id: string | undefined) {
  const { data } = useVault();
  return data?.items.find((i) => i.id === id);
}
