// Phase 6B: security headers for every response, built in one place and used by next.config.ts.
//
// Enforced at once: no framing, no MIME sniffing, a privacy-preserving referrer, device permissions
// limited to the microphone (the voice recorder), and a popup-friendly opener policy.
//
// The Content-Security-Policy is report-only on the live site until a week of real use shows no
// unexplained reports (V-052); CSP_ENFORCE=1 enforces it (the local browser tests always do).
// Scripts allow 'unsafe-inline' because pages stay static: this Next version can only add nonces to
// pages rendered per request (V-051). Everything else is limited to this site, the Supabase project
// and the Google hosts the Drive Picker and browser uploads need.

export type Header = { key: string; value: string };

export function contentSecurityPolicy(opts: { supabaseUrl?: string; reportUri?: string; dev?: boolean }): string {
  let supabase = "";
  try { if (opts.supabaseUrl) supabase = new URL(opts.supabaseUrl).origin; } catch { supabase = ""; }
  const https = supabase.startsWith("https://");
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : []), "https://apis.google.com"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", ...(supabase ? [supabase] : [])]],
    ["media-src", ["'self'", "blob:", ...(supabase ? [supabase] : [])]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...(supabase ? [supabase] : []), "https://www.googleapis.com", ...(opts.dev ? ["ws:"] : [])]],
    ["frame-src", ["https://docs.google.com"]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
  ];
  const parts = directives.map(([name, values]) => `${name} ${values.join(" ")}`);
  // Only where the site itself is served over https; tests run on plain http.
  if (https && !opts.dev) parts.push("upgrade-insecure-requests");
  if (opts.reportUri) parts.push(`report-uri ${opts.reportUri}`);
  return parts.join("; ");
}

export function securityHeaders(env: Record<string, string | undefined> = process.env): Header[] {
  const dev = env.NODE_ENV === "development";
  const csp = contentSecurityPolicy({ supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, reportUri: env.CSP_REPORT_URI || "/api/csp-report", dev });
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: env.CSP_ENFORCE === "1" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only", value: csp },
  ];
}
