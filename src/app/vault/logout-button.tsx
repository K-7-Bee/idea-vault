"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { beginLogout, finishLogout } from "./logout-coordination";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      if (session?.user) setSignedOut(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function logOut() {
    if (pending.current) return;
    const attempt = beginLogout();
    if (!attempt) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setSignedOut(false);
    // Forget the offline copy of the vault so it isn't left on this device after logging out.
    try {
      for (const key of await caches.keys()) await caches.delete(key);
    } catch {
      // no cache support: nothing to clear
    }
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      setSignedOut(true);
    } catch {
      setError("Unable to log out. Please try again.");
    } finally {
      finishLogout(attempt);
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
      {signedOut && <p role="status" className="mt-2 max-w-xs text-sm text-muted">
        Signed out. Keep this tab open to retain unsaved files and edits. {" "}
        <a href="/login" target="_blank" rel="noopener noreferrer" className="underline">Log in in a new tab</a>
      </p>}
    </div>
  );
}
