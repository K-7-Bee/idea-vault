"use client";

import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Outcome } from "@/lib/workspace";
import { useOnline } from "./use-online";
import { useSessionGate } from "./use-session-gate";

export type Message = { text: string; error: boolean; keep?: boolean } | null;

// Online-only writes for project pages. Every write re-checks the signed-in account first and
// drops its result if the Vault locked (logout, account change) while it was running.
export function useVaultWriter(ownerId: string) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const online = useOnline();
  const region = useRef<HTMLDivElement>(null);
  const { gate, locked, retry } = useSessionGate(ownerId, (isLocked) => {
    if (isLocked) region.current?.querySelectorAll("audio, video").forEach((m) => (m as HTMLMediaElement).pause());
  });

  async function run<T>(
    operation: (client: SupabaseClient) => Promise<Outcome<T>>,
    done: string | null,
    onSuccess: (value: T) => void,
  ): Promise<boolean> {
    if (!gate.allowed() || busy) return false;
    if (navigator.onLine === false) {
      setMessage({ text: "You're offline. Nothing was changed; try again when you're connected.", error: true });
      return false;
    }
    const ticket = gate.ticket();
    setBusy(true);
    setMessage(null);
    try {
      const client = createClient();
      try {
        const identity = await client.auth.getUser();
        if (!gate.valid(ticket)) return false;
        if (identity.error || identity.data.user?.id !== ownerId) { gate.lock(); return false; }
      } catch {
        if (gate.valid(ticket)) gate.lock();
        return false;
      }
      const result = await operation(client);
      if (!gate.valid(ticket)) return false;
      if (!result.ok) { setMessage({ text: result.message, error: true }); return false; }
      onSuccess(result.value);
      if (done) setMessage({ text: done, error: false });
      return true;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, message, setMessage, online, locked, retry, region };
}

export function LockedNotice({ retry }: { retry: () => void }) {
  return (
    <section role="alert" className="rounded-2xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold">Vault locked</h2>
      <p className="mt-2">Verify the original account to continue. Unsaved edits on this page are kept while it stays open.</p>
      <button onClick={retry} className="mt-4 underline">Verify account again</button>
    </section>
  );
}
