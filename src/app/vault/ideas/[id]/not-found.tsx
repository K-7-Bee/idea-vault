import Link from "next/link";
import VaultShell from "../../vault-shell";

export default function IdeaNotFound() {
  return (
    <VaultShell>
      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">Idea not found</h2>
        <p className="mt-2 text-sm text-muted">It may have been deleted, or the link is wrong. Removed ideas can be restored from Recovery on the device that removed them.</p>
        <Link className="mt-4 inline-block underline" href="/vault#ideas">Back to your ideas</Link>
      </section>
    </VaultShell>
  );
}
