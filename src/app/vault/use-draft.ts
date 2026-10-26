"use client";

import { useCallback, useSyncExternalStore } from "react";

// Keeps the unsent idea text in the browser so a reload or app switch doesn't lose it.
const KEY = "vault-draft";
const listeners = new Set<() => void>();
let cache: string | null = null;

function read() {
  if (cache === null) {
    try {
      cache = localStorage.getItem(KEY) ?? "";
    } catch {
      cache = ""; // storage blocked: the draft still works, it just isn't remembered
    }
  }
  return cache;
}

function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null; // another tab changed it
      listener();
    }
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDraft(): [string, (value: string) => void] {
  const text = useSyncExternalStore(subscribe, read, () => "");
  const setText = useCallback((value: string) => {
    cache = value;
    try {
      if (value) localStorage.setItem(KEY, value);
      else localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
    listeners.forEach((l) => l());
  }, []);
  return [text, setText];
}
