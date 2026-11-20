import { cache } from "react";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_COLUMNS, type PublishedShowcase } from "./showcase";

// Server only. Reads the published snapshot as an anonymous visitor would: the public key, no
// session, and only the whitelisted columns. Every call happens at request time (connection()) and
// bypasses every cache, so an unpublished project disappears on the very next request.

function anonymous() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

export const publicSupabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// undefined = couldn't be read (the page says so); null = not published.
export const getShowcase = cache(async (slug: string): Promise<PublishedShowcase | null | undefined> => {
  await connection();
  if (!/^[a-z0-9-]{3,60}$/.test(slug) || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const { data, error } = await anonymous().from("showcases").select(PUBLIC_COLUMNS).eq("slug", slug).limit(1);
    if (error || !Array.isArray(data)) return undefined;
    return (data[0] as unknown as PublishedShowcase | undefined) ?? null;
  } catch {
    return undefined;
  }
});

export async function listShowcases(): Promise<PublishedShowcase[] | undefined> {
  await connection();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const { data, error } = await anonymous().from("showcases").select(PUBLIC_COLUMNS)
      .order("published_at", { ascending: false }).limit(100);
    if (error || !Array.isArray(data)) return undefined;
    return data as unknown as PublishedShowcase[];
  } catch {
    return undefined;
  }
}
