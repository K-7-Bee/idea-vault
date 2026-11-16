import Link from "next/link";
import VaultShell from "../../vault-shell";

export default function ProjectNotFound() {
  return (
    <VaultShell>
      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="text-lg font-semibold">Project not found</h2>
        <p className="mt-2 text-sm text-muted">The link may be wrong, or the project belongs to a different account.</p>
        <Link className="mt-4 inline-block underline" href="/vault/projects">Back to the Project Library</Link>
      </section>
    </VaultShell>
  );
}
