"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logOut() {
    setBusy(true);
    // Forget the offline copy of the vault so it isn't left on this device after logging out.
    try {
      for (const key of await caches.keys()) await caches.delete(key);
    } catch {
      // no cache support: nothing to clear
    }
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <button onClick={logOut} disabled={busy} className="py-2 text-sm text-muted disabled:opacity-40">
      Log out
    </button>
  );
}
