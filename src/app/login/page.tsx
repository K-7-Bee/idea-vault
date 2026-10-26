"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { looksOffline } from "@/lib/sync";
import { serif } from "../vault/fonts";
import { SparkIcon } from "../vault/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function logIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(looksOffline(error.message) ? "You're offline. Logging in needs a connection." : error.message);
    }
    else router.replace("/vault");
  }

  const input =
    "w-full rounded-xl border border-line bg-field px-4 py-3 text-base text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

  return (
    <div className="vault min-h-screen text-foreground">
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-lg shadow-accent/30">
            <SparkIcon className="h-7 w-7" />
          </span>
          <h1 className={`${serif.className} text-4xl tracking-tight`}>Idea Vault</h1>
          <p className="text-sm text-muted">Welcome back. Your ideas are waiting.</p>
        </div>
        <form
          onSubmit={logIn}
          className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5 shadow-sm"
        >
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
          <button
            disabled={busy}
            className="mt-1 w-full rounded-xl bg-accent px-3 py-3 text-base font-medium text-on-accent shadow-sm shadow-accent/30 transition hover:brightness-105 active:scale-[0.99] disabled:opacity-50"
          >
            Log in
          </button>
        </form>
        {error ? (
          <p className="text-center text-sm text-danger">{error}</p>
        ) : (
          // Reads the address bar, so it sits behind its own boundary.
          <Suspense>
            <DeniedNotice />
          </Suspense>
        )}
      </main>
    </div>
  );
}

// Shown when the password was right but the account isn't the one allowed into the vault.
function DeniedNotice() {
  if (useSearchParams().get("denied") !== "1") return null;
  return (
    <p className="text-center text-sm text-danger">
      That account isn&apos;t allowed into this vault. Check that ALLOWED_EMAIL matches the email
      you log in with.
    </p>
  );
}
