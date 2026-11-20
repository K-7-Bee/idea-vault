import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { currentDriveStatus } from "@/lib/drive/connection";
import { CALLBACK_RESULTS, type CallbackResult } from "@/lib/drive/flow";
import { verifiedOwner } from "@/lib/vault-owner";
import SessionBoundary from "../session-boundary";
import VaultShell from "../vault-shell";
import DriveSettings from "./drive-settings";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default function SettingsPage({ searchParams }: { searchParams: Search }) {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl border border-line bg-card" />}>
        {searchParams.then((search) => <SettingsContent result={search.drive} />)}
      </Suspense>
    </VaultShell>
  );
}

async function SettingsContent({ result }: { result: string | string[] | undefined }) {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  const status = await currentDriveStatus(supabase, owner.id);
  const known = typeof result === "string" && (CALLBACK_RESULTS as readonly string[]).includes(result)
    ? (result as CallbackResult) : null;
  return (
    <SessionBoundary ownerId={owner.id}>
      <section aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="text-2xl font-bold">Settings</h2>
        <p className="mt-1 text-sm text-muted">Connections and storage for your private Vault.</p>
        <DriveSettings
          initial={status}
          result={known}
          picker={{
            apiKey: process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "",
            appId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "",
          }}
        />
      </section>
    </SessionBoundary>
  );
}
