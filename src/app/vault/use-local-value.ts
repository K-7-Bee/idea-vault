"use client";

import { useCallback, useSyncExternalStore } from "react";

// A string remembered in the browser (localStorage), e.g. an unsent draft or the chosen view.
// Falls back to memory if the browser blocks storage.
const cache = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key) cache.delete(e.key); // another tab changed it
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLocalValue(key: string, fallback: string): [string, (value: string) => void] {
  const getSnapshot = useCallback(() => {
    if (!cache.has(key)) {
      try {
        cache.set(key, localStorage.getItem(key) ?? fallback);
      } catch {
        cache.set(key, fallback);
      }
    }
    return cache.get(key)!;
  }, [key, fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);

  const setValue = useCallback(
    (next: string) => {
      cache.set(key, next);
      try {
        if (next === fallback) localStorage.removeItem(key);
        else localStorage.setItem(key, next);
      } catch {
        // storage blocked: the value still works until the page closes
      }
      notify();
    },
    [key, fallback],
  );

  return [value, setValue];
}
