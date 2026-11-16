"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logoutPending, subscribeLogout } from "./logout-coordination";

// Generations also invalidate work if the same owner unlocks before it finishes.
export function createSessionGate(changed: (locked: boolean) => void) {
  let locked = false;
  let attached = true;
  let generation = 0;
  let listener: (locked: boolean) => void = () => {};
  return {
    attach() { attached = true; },
    detach() { attached = false; generation++; },
    listen(callback: (locked: boolean) => void) { listener = callback; },
    lock() { locked = true; generation++; listener(true); changed(true); },
    unlock() { locked = false; listener(false); changed(false); },
    ticket() { return generation; },
    valid(ticket: number) { return attached && !locked && ticket === generation; },
    allowed() { return attached && !locked; },
  };
}

export function useSessionGate(ownerId: string, onChange: (locked: boolean) => void) {
  const [locked, setLocked] = useState(false);
  const [gate] = useState(() => createSessionGate(setLocked));
  useEffect(() => { gate.listen(onChange); });
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    gate.attach();
    let disposed = false;
    let verification = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const client = createClient();
    async function verify() {
      const id = ++verification;
      gate.lock();
      if (navigator.onLine === false || logoutPending()) return;
      try {
        const { data, error } = await client.auth.getUser();
        if (!disposed && !logoutPending() && id === verification && !error && data.user?.id === ownerId) gate.unlock();
      } catch { /* Keep all work locked and retained for explicit retry. */ }
    }
    const schedule = () => {
      verification++;
      clearTimeout(timer);
      if (logoutPending()) return;
      timer = setTimeout(() => { if (!disposed) void verify(); }, 0);
    };
    const resume = () => {
      if (navigator.onLine !== false) { gate.lock(); schedule(); }
    };
    const visible = () => { if (document.visibilityState === "visible") resume(); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) { gate.lock(); schedule(); } };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      if (event === "SIGNED_OUT" || !session?.user || session.user.id !== ownerId) {
        verification++;
        clearTimeout(timer);
        gate.lock();
      } else if (navigator.onLine !== false) {
        gate.lock();
        schedule();
      }
    });
    retry.current = () => { gate.lock(); schedule(); };
    const unsubscribeLogout = subscribeLogout(() => {
      verification++;
      clearTimeout(timer);
      gate.lock();
    });
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", pageShow);
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      gate.detach();
      verification++;
      clearTimeout(timer);
      subscription.unsubscribe();
      unsubscribeLogout();
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", pageShow);
      document.removeEventListener("visibilitychange", visible);
      retry.current = () => {};
    };
  }, [gate, ownerId]);
  return { gate, locked, retry: () => retry.current() };
}
