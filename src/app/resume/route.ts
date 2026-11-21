import { connection } from "next/server";
import { getPublishedProfile, publicFileUrl } from "@/lib/profile-public";

// Phase 4C: a stable address for the published résumé. It sends the visitor to the current public
// copy, saved under the download name the owner chose, so a link shared once keeps working when the
// file is replaced. It reads the same cached profile as the homepage, at request time, so it never
// points at a copy the homepage has stopped using.
const text = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET() {
  await connection();
  let published;
  try {
    published = await getPublishedProfile();
  } catch {
    return text("The résumé couldn't be loaded just now. Try again in a minute.", 503);
  }
  const resume = published?.content.resume;
  const target = resume?.file.endsWith(".pdf") ? publicFileUrl(resume.file, resume.name) : null;
  if (!target) return text("No résumé is published.", 404);
  return new Response(null, { status: 307, headers: { Location: target, "Cache-Control": "no-store" } });
}
