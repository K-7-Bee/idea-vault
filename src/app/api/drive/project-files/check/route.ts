import type { NextRequest } from "next/server";
import { accessToken } from "@/lib/drive/connection";
import { classifyCheck, isUuid } from "@/lib/drive/files";
import { GoogleError, getFileMeta } from "@/lib/drive/google";
import { denied, json, routeOwner, sameOrigin } from "@/lib/drive/route-helpers";
import { PROJECT_FILE_COLUMNS } from "@/lib/drive/targets";

const CONCURRENCY = 5;
const MAX_ATTEMPTS = 3;

// "Check files": asks Drive about every file linked to a project. A renamed file gets its new name;
// a trashed, deleted or no-longer-accessible file is marked unavailable with the reason. A file that
// is back to normal is marked available again. Records are never removed here.
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "origin" }, 403);
  const session = await routeOwner();
  if (!session) return denied();
  const body = await request.json().catch(() => null) as { projectId?: unknown } | null;
  if (!isUuid(body?.projectId)) return json({ error: "invalid" }, 400);
  const { supabase, owner } = session;

  const listed = await supabase.from("project_files").select("id, drive_file_id, name, state, state_reason")
    .eq("project_id", body.projectId).eq("user_id", owner.id).limit(1000).then((r) => r, () => null);
  if (!listed || listed.error || !Array.isArray(listed.data)) return json({ error: "unavailable" }, 503);
  const access = await accessToken(supabase, owner.id, Date.now());
  if (!access.ok) return json({ error: access.reason }, access.reason === "unavailable" ? 503 : 409);

  const files = listed.data as { id: string; drive_file_id: string; name: string; state: string; state_reason: string | null }[];
  // Files that couldn't be checked or saved, with a short reason shown to the owner (no tokens,
  // no backend messages; Drive code never logs).
  const problems: { id: string; name: string; reason: string }[] = [];
  let renamed = 0;
  const queue = [...files];
  async function worker() {
    for (let file = queue.shift(); file; file = queue.shift()) {
      let outcome = null;
      let lastStatus = 0;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !outcome; attempt++) {
        try {
          outcome = classifyCheck({ meta: await getFileMeta(access.ok ? access.token : "", file.drive_file_id) });
        } catch (error) {
          lastStatus = error instanceof GoogleError ? error.status : 0;
          outcome = classifyCheck({ status: lastStatus });
          if (!outcome && attempt < MAX_ATTEMPTS && (lastStatus === 429 || lastStatus >= 500)) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          else if (!outcome) break;
        }
      }
      if (!outcome) { problems.push({ id: file.id, name: file.name, reason: `drive_${lastStatus || "network"}` }); continue; }
      const newName = outcome.state === "ok" && outcome.name && outcome.name !== file.name ? outcome.name : null;
      const changes = outcome.state === "ok"
        ? { state: "ok", state_reason: null, checked_at: new Date().toISOString(), ...(newName ? { name: newName } : {}) }
        : { state: "unavailable", state_reason: outcome.reason, checked_at: new Date().toISOString() };
      const saved = await supabase.from("project_files").update(changes).eq("id", file.id).eq("user_id", owner.id).select("id")
        .then((r) => r, () => null);
      if (!saved || saved.error || !Array.isArray(saved.data) || saved.data.length !== 1) {
        const code = saved?.error && typeof saved.error === "object" && "code" in saved.error ? String(saved.error.code) : saved ? "no_row" : "network";
        problems.push({ id: file.id, name: file.name, reason: `save_${code}` });
      } else if (newName) renamed++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  const unchecked = problems.length;

  const fresh = await supabase.from("project_files").select(PROJECT_FILE_COLUMNS).eq("project_id", body.projectId).eq("user_id", owner.id)
    .order("created_at", { ascending: false }).limit(1000).then((r) => r, () => null);
  if (!fresh || fresh.error) return json({ error: "unavailable" }, 503);
  return json({ files: fresh.data, unchecked, renamed, problems: problems.map(({ name, reason }) => ({ name, reason })) });
}
