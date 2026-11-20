import { driveStatus } from "@/lib/drive/connection";
import { denied, json, routeOwner } from "@/lib/drive/route-helpers";

// Connection status for the Settings page. Never includes a token.
export async function GET() {
  const session = await routeOwner();
  if (!session) return denied();
  return json(await driveStatus(session.supabase, session.owner.id, Date.now(), true));
}
