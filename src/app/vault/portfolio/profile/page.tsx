import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import { DRAFT_COLUMNS, asDraft, normalize, type ProfileVersion } from "@/lib/profile";
import VaultShell from "../../vault-shell";
import ProfileEditor from "./profile-editor";

// Phase 4B: the Portfolio Manager's profile editor (homepage text). Owner only: the proxy guards
// /vault and this checks again. Nothing here changes the public site until the owner publishes.
const HISTORY_LIMIT = 50;

export default function ProfilePage() {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-card" />}>
        <ProfileContent />
      </Suspense>
    </VaultShell>
  );
}

async function ProfileContent() {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  const [draft, published, history] = await Promise.all([
    supabase.from("profile_drafts").select(DRAFT_COLUMNS).eq("user_id", owner.id).maybeSingle().then((r) => r, () => null),
    supabase.from("profile_published").select("content, version, published_at").limit(1).then((r) => r, () => null),
    supabase.from("profile_versions").select("version, content, published_at").eq("user_id", owner.id)
      .order("version", { ascending: false }).limit(HISTORY_LIMIT).then((r) => r, () => null),
  ]);
  if (!draft || draft.error || !published || published.error || !Array.isArray(published.data) || !history || history.error) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load your profile</h2>
          <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        </div>
        <a className="mt-4 inline-block underline" href="/vault/portfolio/profile">Try loading again</a>
      </section>
    );
  }
  const live = published.data[0] as { content: unknown; version: number; published_at: string } | undefined;
  const versions = (history.data as { version: number; content: unknown; published_at: string }[])
    .map((v): ProfileVersion => ({ version: v.version, content: normalize(v.content), published_at: v.published_at }));
  return (
    <ProfileEditor
      ownerId={owner.id}
      initialDraft={draft.data ? asDraft(draft.data as never) : null}
      live={live ? { version: live.version, content: normalize(live.content), published_at: live.published_at } : null}
      initialVersions={versions}
      historyLimited={versions.length === HISTORY_LIMIT}
    />
  );
}
