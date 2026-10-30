import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { useLock } from './lock';
import type { Item, Settings, VaultData } from './types';
import { deleteImage, readVault, writeVault } from './vault';

export type ItemDraft = Omit<Item, 'id' | 'createdAt' | 'updatedAt'>;

interface VaultContextValue {
  data: VaultData | null;
  error: string | null;
  saveItem: (draft: ItemDraft, id?: string) => Promise<Item>;
  deleteItem: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { everUnlocked } = useLock();
  const [data, setData] = useState<VaultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Latest committed state, plus a queue so two quick saves can't interleave.
  const latest = useRef<VaultData | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!everUnlocked || latest.current) return;
    readVault()
      .then((loaded) => {
        latest.current = loaded;
        setData(loaded);
      })
      .catch((e: Error) => setError(e.message));
  }, [everUnlocked]);

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

  return (
    <VaultContext.Provider value={{ data, error, saveItem, deleteItem, updateSettings }}>
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
