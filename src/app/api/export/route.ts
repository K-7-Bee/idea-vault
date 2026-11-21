import type { NextRequest } from "next/server";
import { denied, json, routeOwner } from "@/lib/drive/route-helpers";
import { buildExport } from "@/lib/export";

// Phase 6A: "Download my data". Owner only (routeOwner checks the session and the allowed email,
// and row security limits every read to the owner's rows). Read-only, never cached. A request that
// the browser marks as coming from another site is refused.
export async function GET(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const file = await buildExport(session.supabase, session.owner);
  const day = file.exportedAt.slice(0, 10).replace(/-/g, "");
  return new Response(JSON.stringify(file, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="idea-vault-export-${day}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
