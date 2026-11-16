import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import SessionBoundary from "../session-boundary";
import { STATUS_COLOR } from "../status";
import VaultShell from "../vault-shell";

// Archived ideas are shown in pages this size, most recently archived first.
const ARCHIVE_PAGE = 200;

export default function ArchivePage() {
  return (
    <VaultShell>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl border border-line bg-card" />}>
        <ArchiveContent />
      </Suspense>
    </VaultShell>
  );
}

type ArchivedRow = { id: string; title: string | null; content: string; status: string; archived_at: string };

async function ArchiveContent() {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  if (!owner) {
    return <section role="alert">Unable to verify your account. <a href="/login">Log in again</a></section>;
  }
  const result = await supabase
    .from("ideas")
    .select("id, title, content, status, archived_at")
    .eq("user_id", owner.id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(ARCHIVE_PAGE + 1)
    .then((r) => r, () => null);
  if (!result || result.error || !result.data) {
    return (
      <section className="rounded-2xl border border-line bg-card p-6">
        <div role="alert">
          <h2 className="text-lg font-semibold">Unable to load the archive</h2>
          <p className="mt-2 text-sm text-muted">Nothing was changed. Check your connection and try again.</p>
        </div>
        <a className="mt-4 inline-block underline" href="/vault/archive">Try loading again</a>
      </section>
    );
  }
  const rows = (result.data as ArchivedRow[]).slice(0, ARCHIVE_PAGE);
  const more = result.data.length > ARCHIVE_PAGE;

  return (
    <SessionBoundary ownerId={owner.id}>
      <section aria-labelledby="archive-heading">
        <h2 id="archive-heading" className="text-2xl font-bold">Archive</h2>
        <p className="mt-1 text-sm text-muted">
          Archived ideas are hidden from your list and counts. Nothing in them is deleted; open one to restore it.
        </p>
        {rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-muted">
            Nothing archived.
          </p>
        ) : (
          <ul className="mt-6 grid gap-3">
            {rows.map((idea) => (
              <li key={idea.id}>
                <Link
                  href={`/vault/ideas/${idea.id}`}
                  className="relative block overflow-hidden rounded-2xl border border-line bg-card p-4 pl-5 shadow-sm transition hover:shadow-md"
                >
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: STATUS_COLOR[idea.status] }} />
                  <span className="block break-words font-semibold">{idea.title ?? (idea.content.slice(0, 120) || "Attachment-only idea")}</span>
                  {idea.title && idea.content && <span className="mt-1 line-clamp-2 block break-words text-sm text-muted">{idea.content}</span>}
                  <span className="mt-2 block text-xs capitalize text-muted">
                    {idea.status} · archived {new Date(idea.archived_at).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {more && <p className="mt-4 text-sm text-muted">Showing the {ARCHIVE_PAGE} most recently archived ideas.</p>}
      </section>
    </SessionBoundary>
  );
}
