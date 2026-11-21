import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_COLUMNS, normalize, type PublishedProfile } from "./profile";

// Server only. The published profile, read as an anonymous visitor would: the public key, no
// session, and only the whitelisted columns (migration 014).
//
// The homepage stays in the static shell: this result is cached until the publish route calls
// revalidateTag(PROFILE_TAG, "max"); the next request is served the previous page while the new
// one is built (the publish route makes that request itself).
// Errors are thrown on purpose, never turned into the seed: at build time that fails the build (the
// live deployment keeps running), and a failed background rebuild leaves the last good page in
// place. Falling back to the seed could bring back text the owner removed. ({ expire: 0 } is not
// used: a failed rebuild then served the build-time page, verified in tests/browser/profile.spec.ts.)
export const PROFILE_TAG = "profile";

// null = nothing published yet (the homepage shows the seed).
export async function getPublishedProfile(): Promise<PublishedProfile | null> {
  "use cache";
  cacheTag(PROFILE_TAG);
  cacheLife("max");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.from("profile_published").select(PUBLIC_COLUMNS).limit(1);
  if (error || !Array.isArray(data)) throw new Error(`The published profile couldn't be read (${error?.code ?? "no data"}).`);
  const row = data[0] as { content?: unknown; published_at?: string } | undefined;
  return row ? { content: normalize(row.content), published_at: String(row.published_at ?? "") } : null;
}
