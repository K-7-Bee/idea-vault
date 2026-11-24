// Phase 6B: receives Content-Security-Policy violation reports while the policy is report-only.
// Logs one short line per report (the directive and the blocked origin; no page address or query,
// no personal data) to the runtime logs, and stores nothing. Bodies over 8 KB are ignored.
const MAX_BYTES = 8 * 1024;

function origin(value: unknown): string {
  if (typeof value !== "string" || !value) return "(none)";
  if (/^(inline|eval|data|blob|self|wasm-eval|trusted-types-sink)$/.test(value)) return value;
  try { return new URL(value).origin; } catch { return value.slice(0, 40).replace(/[^\w:.-]/g, "_"); }
}

export async function POST(request: Request) {
  // Refuse an oversized body before reading it (anyone can post here).
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return new Response(null, { status: 204 });
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BYTES) return new Response(null, { status: 204 });
  let reports: Record<string, unknown>[] = [];
  try {
    const body = JSON.parse(text) as unknown;
    // report-uri sends {"csp-report": {...}}; the Reporting API sends [{ type, body: {...} }].
    if (Array.isArray(body)) reports = body.map((r) => (r as { body?: Record<string, unknown> })?.body ?? {}).slice(0, 5);
    else if (body && typeof body === "object") reports = [((body as Record<string, unknown>)["csp-report"] ?? body) as Record<string, unknown>];
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const r of reports) {
    const directive = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "unknown").slice(0, 40).replace(/[^\w-]/g, "");
    console.warn(`csp-violation directive=${directive} blocked=${origin(r["blocked-uri"] ?? r.blockedURL)}`);
  }
  return new Response(null, { status: 204 });
}
