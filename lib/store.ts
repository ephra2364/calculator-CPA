'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AppData, Period, Product } from './types';

// V1 : stockage local du navigateur. Une seule clé, un seul format versionné :
// l'adaptateur pourra être remplacé par une base de données / synchronisation cloud sans toucher au moteur.
const KEY = 'cpa-calculator:v1';
const EMPTY: AppData = { version: 1, products: [], periods: [] };

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.products) || !Array.isArray(d.periods)) return EMPTY;
    return { version: 1, products: d.products, periods: d.periods };
  } catch {
    return EMPTY;
  }
}
export function saveData(d: AppData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}
export function validateImport(d: unknown): AppData | null {
  if (!d || typeof d !== 'object') return null;
  const x = d as AppData;
  if (!Array.isArray(x.products) || !Array.isArray(x.periods)) return null;
  if (!x.products.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string')) return null;
  if (!x.periods.every((p) => p && typeof p.id === 'string' && typeof p.productId === 'string' && typeof p.start === 'string')) return null;
  return { version: 1, products: x.products, periods: x.periods };
}

export function useStore() {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    setData(loadData());
    setReady(true);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setData(loadData()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const commit = useCallback((fn: (d: AppData) => AppData) => {
    setData((prev) => {
      const next = fn(prev);
      setSaveError(!saveData(next));
      return next;
    });
  }, []);
  return {
    data, ready, saveError,
    upsertProduct: (p: Product) => commit((d) => ({ ...d, products: d.products.some((x) => x.id === p.id)
      ? d.products.map((x) => (x.id === p.id ? { ...p, updatedAt: new Date().toISOString() } : x)) : [...d.products, p] })),
    deleteProduct: (id: string) => commit((d) => ({ ...d, products: d.products.filter((x) => x.id !== id), periods: d.periods.filter((x) => x.productId !== id) })),
    upsertPeriod: (p: Period) => commit((d) => ({ ...d, periods: d.periods.some((x) => x.id === p.id) ? d.periods.map((x) => (x.id === p.id ? p : x)) : [...d.periods, p] })),
    deletePeriod: (id: string) => commit((d) => ({ ...d, periods: d.periods.filter((x) => x.id !== id) })),
    replaceAll: (d: AppData) => commit(() => d),
    mergeExamples: (d: AppData) => commit((cur) => ({ ...cur, products: [...cur.products.filter((p) => !p.isExample), ...d.products], periods: [...cur.periods.filter((x) => !cur.products.some((p) => p.isExample && p.id === x.productId)), ...d.periods] })),
    removeExamples: () => commit((cur) => {
      const ids = new Set(cur.products.filter((p) => p.isExample).map((p) => p.id));
      return { ...cur, products: cur.products.filter((p) => !ids.has(p.id)), periods: cur.periods.filter((x) => !ids.has(x.productId)) };
    })
  };
}
export type Store = ReturnType<typeof useStore>;
