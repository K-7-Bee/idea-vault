import type { SupabaseClient, User } from "@supabase/supabase-js";

// The signed-in user, only if it is the vault's single allowed owner.
export async function verifiedOwner(supabase: SupabaseClient): Promise<User | null> {
  const identity = await supabase.auth.getUser().catch(() => null);
  const user = identity?.data.user;
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (identity?.error || !user || !allowed || user.email?.toLowerCase() !== allowed) return null;
  return user;
}
