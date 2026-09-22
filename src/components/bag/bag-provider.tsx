'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { lineKey, mergeLine, parseBag, type BagLine } from '@/lib/bag';
import type { Catalogue, Settings } from '@/lib/catalogue/types';

const storageKey = 'papas-tacos:bag:v1';
type BagContextValue = {
  lines: BagLine[]; ready: boolean; storageError: boolean; catalogue: Catalogue; settings: Settings | null;
  add: (line: BagLine, replacing?: string) => void; setQuantity: (key: string, quantity: number) => void; remove: (key: string) => void;
};
const BagContext = createContext<BagContextValue | null>(null);

export function BagProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<BagLine[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [data, setData] = useState<{ catalogue: Catalogue; settings: Settings | null }>({ catalogue: { items: [], categories: [], available: false }, settings: null });

  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch('/api/catalogue', { cache: 'no-store', signal: controller.signal });
        if (response.ok) setData(await response.json());
      } catch { if (!controller.signal.aborted) setData({ catalogue: { items: [], categories: [], available: false }, settings: null }); }
    }
    async function hydrate() {
      let stored: BagLine[] = [];
      let failed = false;
      try { stored = parseBag(localStorage.getItem(storageKey)); } catch { failed = true; }
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLines(stored); setStorageError(failed); setReady(true);
    }
    function syncStorage(event: StorageEvent) {
      if (event.key === storageKey || event.key === null) setLines(parseBag(event.newValue));
    }
    void hydrate(); void refresh();
    window.addEventListener('storage', syncStorage);
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => { controller.abort(); window.removeEventListener('storage', syncStorage); window.removeEventListener('focus', refresh); window.clearInterval(interval); };
  }, []);

  function save(next: BagLine[]) {
    setLines(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, lines: next })); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function add(line: BagLine, replacing?: string) {
    save(mergeLine(replacing ? lines.filter((candidate) => lineKey(candidate) !== replacing) : lines, line));
  }
  function setQuantity(key: string, quantity: number) {
    if (quantity < 1 || quantity > 99 || !Number.isInteger(quantity)) return;
    save(lines.map((line) => lineKey(line) === key ? { ...line, quantity } : line));
  }
  return <BagContext.Provider value={{ lines, ready, storageError, ...data, add, setQuantity, remove: (key) => save(lines.filter((line) => lineKey(line) !== key)) }}>{children}</BagContext.Provider>;
}

export function useBag() {
  const context = useContext(BagContext);
  if (!context) throw new Error('BagProvider is required.');
  return context;
}