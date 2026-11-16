import type { SupabaseClient } from "@supabase/supabase-js";
import { saveRecovery, getRecovery, type RecoveryRecord, type RecoveryFile } from "./recovery";
import { type RawIdea, type FileRow } from "./ideas";
import type { QueuedIdea } from "./outbox";

const COLUMNS = "id, content, status, tags, created_at, files:idea_files(id, path, name, mime_type, size, created_at)";
type Verify = () => Promise<void>;
function check(error: unknown) { if (error) throw new Error("Recovery could not finish. Your recovery record and stored files are retained. Try again."); }
function validate(record: RecoveryRecord, ownerId: string) {
  if (record.owner_id !== ownerId || (record.queued && (record.queued.owner_id !== ownerId || record.queued.id !== record.idea.id)) ||
      record.idea.files.some((file) => !file.path.startsWith(`${ownerId}/${record.idea.id}/`))) {
    throw new Error("Recovery ownership could not be verified.");
  }
}

// PostgreSQL text[] literal: preserve punctuation, quotes and backslashes exactly.
export function tagsFilter(tags: string[]) { return `{${tags.map((tag) => JSON.stringify(tag)).join(",")}}`; }

export async function retainDeletedIdea(client: SupabaseClient, item: QueuedIdea, verify: Verify) {
  await verify();
  const id = item.recovery_id ?? `${item.owner_id}:idea:${item.id}`;
  const previous = await getRecovery(id);
  await verify();
  const result = await client.from("ideas").select(COLUMNS).eq("id", item.id).eq("user_id", item.owner_id!).maybeSingle();
  check(result.error);
  const current = result.data as unknown as RawIdea | null;
  if (previous && previous.prepared !== false && current && JSON.stringify(current) !== JSON.stringify(previous.idea)) {
    throw new Error("The idea changed after removal was requested. Restore/cancel the removal and review the saved version before trying again.");
  }
  // A missing row on retry must never overwrite the original recovery metadata.
  const record: RecoveryRecord = (previous?.prepared !== false ? previous : undefined) ?? (current ? {
    id, owner_id: item.owner_id!, kind: "idea", prepared: true, saved_at: new Date().toISOString(), idea: current, queued: item,
  } : previous ?? {
    id, owner_id: item.owner_id!, kind: "idea", saved_at: new Date().toISOString(),
    idea: { id: item.id, content: item.content, tags: item.tags, status: "exploring", created_at: item.created_at, files: [] }, queued: item,
  });
  validate(record, item.owner_id!);
  await saveRecovery(record);
  await verify();
  if (!current) return;
  // Refuse a concurrent edit; do not delete a newer record than the recovery snapshot.
  const deleted = await client.from("ideas").delete().eq("id", item.id).eq("user_id", item.owner_id!)
    .eq("content", current.content).eq("status", current.status).filter("tags", "eq", tagsFilter(current.tags)).select("id");
  check(deleted.error);
  if (deleted.data?.length !== 1) throw new Error("The idea changed before deletion. It remains saved; cancel the removal and review the saved version.");
  await verify();
}

export async function retainDeletedFile(client: SupabaseClient, ownerId: string, ideaId: string, file: FileRow, verify: Verify) {
  await verify();
  const result = await client.from("ideas").select(COLUMNS).eq("id", ideaId).eq("user_id", ownerId).single();
  check(result.error);
  const idea = result.data as unknown as RawIdea;
  const savedFile = idea.files.find((entry) => entry.id === file.id);
  if (!savedFile) throw new Error("This attachment has changed. Refresh its idea before removing it.");
  if (!idea.content && idea.files.length === 1) throw new Error("This is the idea's only content. Remove the whole idea instead.");
  const record: RecoveryRecord = { id: `${ownerId}:file:${file.id}`, owner_id: ownerId,
    kind: "file", saved_at: new Date().toISOString(), idea: { ...idea, files: [savedFile] } };
  validate(record, ownerId);
  await saveRecovery(record);
  await verify();
  const deleted = await client.from("idea_files").delete().eq("id", file.id).eq("idea_id", ideaId)
    .eq("user_id", ownerId).eq("path", savedFile.path).select("id");
  check(deleted.error);
  if (deleted.data?.length !== 1) throw new Error("Attachment removal was not confirmed. Its recovery record is retained.");
  await verify();
}

function sameFile(a: RecoveryFile, b: RecoveryFile) {
  return a.path === b.path && a.name === b.name && a.mime_type === b.mime_type && Number(a.size) === Number(b.size);
}

export async function restoreRecovery(client: SupabaseClient, record: RecoveryRecord, ownerId: string, verify: Verify) {
  validate(record, ownerId);
  await verify();
  const result = await client.from("ideas").select(COLUMNS).eq("id", record.idea.id).eq("user_id", ownerId).maybeSingle();
  check(result.error);
  const current = result.data as unknown as RawIdea | null;
  if (record.kind === "idea" && current && (current.content !== record.idea.content || current.status !== record.idea.status ||
      JSON.stringify(current.tags) !== JSON.stringify(record.idea.tags) || current.created_at !== record.idea.created_at)) {
    throw new Error("A different saved version of this idea exists. Recovery will not overwrite it.");
  }
  if (!current) {
    if (record.kind === "file") throw new Error("Restore the parent idea before restoring this attachment.");
    await verify();
    const { id, content, status, tags, created_at } = record.idea;
    check((await client.from("ideas").insert({ id, content, status, tags, created_at, user_id: ownerId })).error);
  }
  for (const file of record.idea.files) {
    const existing = current?.files.find((entry) => entry.id === file.id);
    if (existing) {
      if (!sameFile(existing, file)) throw new Error("An attachment with this ID differs. Recovery will not overwrite it.");
      continue;
    }
    await verify();
    const { id, path, name, mime_type, size, created_at } = file;
    check((await client.from("idea_files").insert({ id, path, name, mime_type, size,
      ...(created_at ? { created_at } : {}), idea_id: record.idea.id, user_id: ownerId })).error);
  }
  await verify();
  // Records remain available after success for interrupted/partial restores. Never purge bytes here.
}
