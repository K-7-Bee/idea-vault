import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { verifiedOwner } from "@/lib/vault-owner";
import type { CallbackResult } from "./flow";

// Server only. Shared checks for /api/drive/*. The proxy only guards /vault, so every Drive
// route verifies the Vault owner itself.

export async function routeOwner(): Promise<{ supabase: SupabaseClient; owner: User } | null> {
  const supabase = await createClient();
  const owner = await verifiedOwner(supabase);
  return owner ? { supabase, owner } : null;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const denied = () => json({ error: "not_owner" }, 401);

// The address the browser actually used. request.nextUrl can name the server's bind address
// (for example localhost instead of 127.0.0.1), so use the forwarded or Host header when present.
// Google still only accepts redirect URIs registered for the OAuth client.
export function siteOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || request.nextUrl.protocol.replace(":", "");
  if (!host || !/^[A-Za-z0-9.\-:[\]]+$/.test(host) || !["http", "https"].includes(proto)) return request.nextUrl.origin;
  return `${proto}://${host}`;
}

// State-changing requests must come from this site's own pages.
export function sameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === siteOrigin(request);
}

export function siteUrl(request: NextRequest, path: string): URL {
  return new URL(path, siteOrigin(request));
}

export function callbackUri(request: NextRequest): string {
  return `${siteOrigin(request)}/api/drive/callback`;
}

export function settingsUrl(request: NextRequest, result: CallbackResult): URL {
  const url = siteUrl(request, "/vault/settings");
  url.searchParams.set("drive", result);
  return url;
}

export function secureCookie(request: NextRequest): boolean {
  return siteOrigin(request).startsWith("https:");
}
