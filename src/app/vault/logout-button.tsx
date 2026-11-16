"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function logOut() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    // Forget the offline copy of the vault so it isn't left on this device after logging out.
    try {
      for (const key of await caches.keys()) await caches.delete(key);
    } catch {
      // no cache support: nothing to clear
    }
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/login");
    } catch {
      setError("Unable to log out. Please try again.");
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button onClick={logOut} disabled={busy} className="rounded-full border border-line bg-card px-4 py-2 text-sm text-muted transition hover:text-foreground disabled:opacity-40">
        Log out
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-muted">{error}</p>}
    </div>
  );
}
