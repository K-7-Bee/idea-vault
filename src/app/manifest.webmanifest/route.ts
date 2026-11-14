import vaultManifest from "@/lib/vault-manifest";

// Explicitly linked from the vault layout so public portfolio pages do not install as Vault.
export function GET() {
  return Response.json(vaultManifest(), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
