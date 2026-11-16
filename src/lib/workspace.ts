import type { SupabaseClient } from "@supabase/supabase-js";

// Projects, Engineering Lab and Story Studio records (migrations 006 and 007).
// Every write is owner-scoped, and an update or delete only applies to the exact version the
// page last saw, so a stale tab or second device can never silently overwrite newer work.

export const STAGES = ["exploring", "analyzing", "building", "completed"] as const;
export const PROJECT_TYPES = [
  { value: "engineering", label: "Engineering" },
  { value: "story", label: "Story" },
  { value: "hybrid", label: "Hybrid" },
] as const;
// "published" exists in the database for the later Portfolio Manager; this phase cannot set it.
export const PUBLICATION = [
  { value: "private", label: "Private" },
  { value: "ready", label: "Ready to showcase" },
  { value: "published", label: "Published" },
] as const;
export const SETTABLE_PUBLICATION = ["private", "ready"] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number]["value"];
export type Project = {
  id: string;
  title: string;
  project_type: ProjectType;
  stage: string;
  publication_status: string;
  summary: string;
  goals: string;
  source_idea_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  archived_at: string | null;
};
export type Row = { id: string; version: number; created_at: string; updated_at: string; [key: string]: unknown };

export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "conflict" | "failed" | "invalid" | "blocked"; message: string };

const CONFLICT = {
  ok: false,
  reason: "conflict",
  message: "This changed in another tab or device, or was removed. Nothing was overwritten. Reload to see the saved version.",
} as const;
const FAILED = {
  ok: false,
  reason: "failed",
  message: "Couldn't save. Check your connection and try again. Your changes are still here.",
} as const;
const invalid = (message: string) => ({ ok: false, reason: "invalid", message }) as const;

// Only a completed AND published, non-archived project may ever appear on the public site.
// Nothing public reads projects yet; this is the rule the later publishing bridge must use.
export function isPubliclyVisible(p: Pick<Project, "stage" | "publication_status" | "archived_at">) {
  return p.stage === "completed" && p.publication_status === "published" && p.archived_at === null;
}

export function hasEngineering(type: string) {
  return type === "engineering" || type === "hybrid";
}
export function hasStory(type: string) {
  return type === "story" || type === "hybrid";
}

// ---------- Record definitions shared by the forms, list views and validation ----------

export type TableName =
  | "project_tasks"
  | "project_milestones"
  | "project_entries"
  | "project_components"
  | "project_links"
  | "story_bible_entries"
  | "story_characters"
  | "story_relationships"
  | "story_units"
  | "story_timeline_events"
  | "story_continuity";

type Option = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  kind: "text" | "textarea" | "select" | "number" | "date" | "url" | "ref";
  required?: boolean;
  // Stored as null (not "") when left empty.
  nullable?: boolean;
  max?: number;
  options?: readonly Option[];
  ref?: TableName;
  hint?: string;
};
export type TableConfig = {
  table: TableName;
  singular: string;
  plural: string;
  titleField: string;
  fields: Field[];
  // Rows with a position can be moved up and down; others are listed newest first.
  positioned: boolean;
  // Rows are shown in groups of this select field, with buttons to move between groups.
  groupBy?: string;
};

const URL_PATTERN = /^https?:\/\/\S+$/i;

export const TABLES: Record<TableName, TableConfig> = {
  project_tasks: {
    table: "project_tasks", singular: "task", plural: "Tasks", titleField: "title", positioned: true, groupBy: "status",
    fields: [
      { name: "title", label: "Task", kind: "text", required: true, max: 300 },
      { name: "status", label: "Column", kind: "select", options: [
        { value: "todo", label: "To do" }, { value: "doing", label: "Doing" }, { value: "done", label: "Done" }] },
      { name: "milestone_id", label: "Milestone", kind: "ref", ref: "project_milestones", nullable: true },
      { name: "notes", label: "Notes", kind: "textarea", max: 20000 },
    ],
  },
  project_milestones: {
    table: "project_milestones", singular: "milestone", plural: "Milestones", titleField: "title", positioned: true, groupBy: "status",
    fields: [
      { name: "title", label: "Milestone", kind: "text", required: true, max: 300 },
      { name: "due_on", label: "Target date", kind: "date", nullable: true },
      { name: "status", label: "Status", kind: "select", options: [{ value: "open", label: "Open" }, { value: "done", label: "Reached" }] },
      { name: "notes", label: "Notes", kind: "textarea", max: 20000 },
    ],
  },
  project_entries: {
    table: "project_entries", singular: "entry", plural: "Lab notebook", titleField: "title", positioned: false,
    fields: [
      { name: "kind", label: "Type", kind: "select", options: [
        { value: "note", label: "Technical note" }, { value: "experiment", label: "Experiment" },
        { value: "evidence", label: "Test evidence" }, { value: "result", label: "Result" },
        { value: "lesson", label: "Lesson" }, { value: "decision", label: "Decision" }] },
      { name: "title", label: "Title", kind: "text", required: true, max: 300 },
      { name: "body", label: "Details", kind: "textarea", max: 50000, hint: "What you did, measured or decided. Record real values only." },
      { name: "link", label: "Evidence link", kind: "url", nullable: true, hint: "Optional: log, photo, video or data file (https://…)." },
    ],
  },
  project_components: {
    table: "project_components", singular: "component", plural: "Components", titleField: "name", positioned: true, groupBy: "status",
    fields: [
      { name: "name", label: "Component", kind: "text", required: true, max: 200 },
      { name: "specification", label: "Part number / specification", kind: "text", max: 2000 },
      { name: "quantity", label: "Quantity", kind: "number", nullable: true },
      { name: "unit", label: "Unit", kind: "text", max: 30, hint: "For example pcs, m, g." },
      { name: "status", label: "Status", kind: "select", options: [
        { value: "needed", label: "Needed" }, { value: "ordered", label: "Ordered" }, { value: "have", label: "In hand" }] },
      { name: "link", label: "Datasheet or source", kind: "url", nullable: true },
      { name: "notes", label: "Notes", kind: "textarea", max: 5000 },
    ],
  },
  project_links: {
    table: "project_links", singular: "link", plural: "Links & references", titleField: "label", positioned: false,
    fields: [
      { name: "label", label: "Name", kind: "text", required: true, max: 200 },
      { name: "url", label: "Address", kind: "url", required: true },
      { name: "kind", label: "Type", kind: "select", options: [
        { value: "repository", label: "Repository" }, { value: "code", label: "Code" },
        { value: "documentation", label: "Documentation" }, { value: "reference", label: "Reference" },
        { value: "other", label: "Other" }] },
      { name: "notes", label: "Notes", kind: "textarea", max: 5000 },
    ],
  },
  story_bible_entries: {
    table: "story_bible_entries", singular: "entry", plural: "Story Bible", titleField: "title", positioned: true, groupBy: "section",
    fields: [
      { name: "section", label: "Section", kind: "select", options: [
        { value: "premise", label: "Premise" }, { value: "world", label: "World" }, { value: "rules", label: "Rules" },
        { value: "tone", label: "Tone & style" }, { value: "themes", label: "Themes" }, { value: "other", label: "Other" }] },
      { name: "title", label: "Title", kind: "text", required: true, max: 300 },
      { name: "body", label: "Text", kind: "textarea", max: 50000 },
    ],
  },
  story_characters: {
    table: "story_characters", singular: "character", plural: "Characters", titleField: "name", positioned: true,
    fields: [
      { name: "name", label: "Name", kind: "text", required: true, max: 200 },
      { name: "role", label: "Role", kind: "text", max: 200, hint: "For example protagonist, mentor." },
      { name: "description", label: "Description", kind: "textarea", max: 20000 },
      { name: "traits", label: "Traits", kind: "textarea", max: 5000 },
      { name: "arc", label: "Arc", kind: "textarea", max: 10000 },
    ],
  },
  story_relationships: {
    table: "story_relationships", singular: "relationship", plural: "Relationships", titleField: "relationship", positioned: false,
    fields: [
      { name: "from_character_id", label: "Character", kind: "ref", ref: "story_characters", required: true },
      { name: "relationship", label: "Relationship", kind: "text", required: true, max: 200, hint: "For example sister of, rival of." },
      { name: "to_character_id", label: "To", kind: "ref", ref: "story_characters", required: true },
      { name: "notes", label: "Notes", kind: "textarea", max: 5000 },
    ],
  },
  story_units: {
    table: "story_units", singular: "item", plural: "Structure", titleField: "title", positioned: true,
    fields: [
      { name: "kind", label: "Level", kind: "select", options: [
        { value: "season", label: "Season" }, { value: "episode", label: "Episode" },
        { value: "scene", label: "Scene" }, { value: "shot", label: "Shot" }] },
      { name: "parent_id", label: "Inside", kind: "ref", ref: "story_units", nullable: true, hint: "Levels are optional; leave empty to place it at the top." },
      { name: "title", label: "Title", kind: "text", required: true, max: 300 },
      { name: "summary", label: "Summary", kind: "textarea", max: 20000 },
      { name: "location", label: "Location", kind: "text", max: 300 },
      { name: "time_of_day", label: "Time of day", kind: "text", max: 100 },
      { name: "camera", label: "Camera / framing", kind: "textarea", max: 2000, hint: "Shots: angle, lens, movement." },
      { name: "duration_seconds", label: "Duration (seconds)", kind: "number", nullable: true },
    ],
  },
  story_timeline_events: {
    table: "story_timeline_events", singular: "event", plural: "Timeline", titleField: "title", positioned: true,
    fields: [
      { name: "title", label: "Event", kind: "text", required: true, max: 300 },
      { name: "story_time", label: "When (in the story)", kind: "text", max: 200, hint: "For example Day 3, dawn." },
      { name: "unit_id", label: "Scene / shot", kind: "ref", ref: "story_units", nullable: true },
      { name: "description", label: "Description", kind: "textarea", max: 20000 },
    ],
  },
  story_continuity: {
    table: "story_continuity", singular: "record", plural: "Continuity", titleField: "subject", positioned: false, groupBy: "status",
    fields: [
      { name: "subject", label: "What must stay consistent", kind: "text", required: true, max: 300 },
      { name: "detail", label: "Detail", kind: "textarea", max: 20000 },
      { name: "unit_id", label: "Scene / shot", kind: "ref", ref: "story_units", nullable: true },
      { name: "character_id", label: "Character", kind: "ref", ref: "story_characters", nullable: true },
      { name: "status", label: "Status", kind: "select", options: [{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }] },
    ],
  },
};

export const ENGINEERING_TABLES: TableName[] = ["project_tasks", "project_milestones", "project_entries", "project_components"];
export const STORY_TABLES: TableName[] = [
  "story_bible_entries", "story_characters", "story_relationships", "story_units", "story_timeline_events", "story_continuity",
];
export const ALL_TABLES: TableName[] = [...ENGINEERING_TABLES, "project_links", ...STORY_TABLES];

// Turns form input into database values. Returns a message instead of guessing on bad input.
export function cleanValues(config: TableConfig, input: Record<string, unknown>):
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; message: string } {
  const values: Record<string, unknown> = {};
  for (const field of config.fields) {
    const raw = input[field.name];
    const text = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!text) {
      if (field.required) return { ok: false, message: `${field.label} is required.` };
      if (field.kind === "select") values[field.name] = field.options![0].value;
      else values[field.name] = field.nullable ? null : "";
      continue;
    }
    if (field.max && text.length > field.max) return { ok: false, message: `${field.label} is too long (max ${field.max} characters).` };
    switch (field.kind) {
      case "select":
        if (!field.options!.some((o) => o.value === text)) return { ok: false, message: `Choose a valid ${field.label.toLowerCase()}.` };
        values[field.name] = text;
        break;
      case "number": {
        const n = Number(text);
        if (!Number.isFinite(n) || n <= 0) return { ok: false, message: `${field.label} must be a number above zero.` };
        values[field.name] = n;
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, message: `${field.label} must be a date.` };
        values[field.name] = text;
        break;
      case "url":
        if (text.length > 2000 || !URL_PATTERN.test(text)) return { ok: false, message: `${field.label} must start with https:// or http://.` };
        values[field.name] = text;
        break;
      default:
        values[field.name] = field.kind === "textarea" ? String(raw).replace(/\s+$/, "") : text;
    }
  }
  return { ok: true, values };
}

// ---------- Story structure helpers ----------

export const UNIT_LEVELS = ["season", "episode", "scene", "shot"] as const;
const UNIT_LABEL: Record<string, string> = { season: "Season", episode: "Episode", scene: "Scene", shot: "Shot" };

export function unitRank(kind: unknown) {
  return UNIT_LEVELS.indexOf(kind as (typeof UNIT_LEVELS)[number]);
}

// The exact place of a scene or shot, for example "Season: S1 › Scene: Market › Shot: Close-up".
export function unitPath(units: Row[], id: string | null | undefined): string {
  const byId = new Map(units.map((u) => [u.id, u]));
  const parts: string[] = [];
  const seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(`${UNIT_LABEL[String(current.kind)] ?? "Item"}: ${String(current.title)}`);
    current = current.parent_id ? byId.get(String(current.parent_id)) : undefined;
  }
  return parts.join(" › ");
}

// ---------- Ordering and derived summaries ----------

export function sortRows(config: TableConfig, rows: Row[]): Row[] {
  return [...rows].sort((a, b) =>
    config.positioned
      ? Number(a.position) - Number(b.position) || a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
}

export function nextPosition(rows: Row[]) {
  return rows.reduce((max, r) => Math.max(max, Number(r.position) || 0), 0) + 1;
}

// "Resume project": the task in progress, otherwise the first task still to do.
// Derived from saved tasks only; nothing is invented when there are none.
export function nextAction(tasks: Row[]): Row | null {
  const sorted = sortRows(TABLES.project_tasks, tasks);
  return sorted.find((t) => t.status === "doing") ?? sorted.find((t) => t.status === "todo") ?? null;
}

// ---------- Writes ----------

type Failure = { code?: string; message?: string } | null;

function describeFailure(error: Failure): Outcome<never> {
  if (error?.code === "23503") {
    return { ok: false, reason: "blocked", message: "This still contains or is linked to other items. Move or remove those first; nothing was changed." };
  }
  if (error?.code === "23514" || error?.code === "22P02" || error?.code === "23502") {
    return invalid("That value isn't allowed here. Nothing was changed.");
  }
  return FAILED;
}

export async function insertRecord(
  client: SupabaseClient,
  table: TableName,
  ownerId: string,
  projectId: string,
  values: Record<string, unknown>,
): Promise<Outcome<Row>> {
  // A fixed id makes a retried save find the first attempt instead of creating a duplicate.
  const id = crypto.randomUUID();
  try {
    const { data, error } = await client
      .from(table)
      .insert({ ...values, id, user_id: ownerId, project_id: projectId })
      .select("*")
      .single();
    if (error) return describeFailure(error);
    return { ok: true, value: data as Row };
  } catch {
    return FAILED;
  }
}

export async function updateRecord(
  client: SupabaseClient,
  table: TableName | "projects",
  ownerId: string,
  base: { id: string; version: number },
  changes: Record<string, unknown>,
): Promise<Outcome<Row>> {
  try {
    const { data, error } = await client
      .from(table)
      .update(changes)
      .eq("id", base.id)
      .eq("user_id", ownerId)
      .eq("version", base.version)
      .select("*");
    if (error) return describeFailure(error);
    if (!data || data.length !== 1) return CONFLICT;
    return { ok: true, value: data[0] as Row };
  } catch {
    return FAILED;
  }
}

export async function deleteRecord(
  client: SupabaseClient,
  table: TableName,
  ownerId: string,
  base: { id: string; version: number },
): Promise<Outcome<{ id: string }>> {
  try {
    const { data, error } = await client
      .from(table)
      .delete()
      .eq("id", base.id)
      .eq("user_id", ownerId)
      .eq("version", base.version)
      .select("id");
    if (error) return describeFailure(error);
    if (!data || data.length !== 1) return CONFLICT;
    return { ok: true, value: { id: base.id } };
  } catch {
    return FAILED;
  }
}

// Swaps two neighbours. Each half is version-checked; if the second half fails the list
// is reloaded by the caller rather than guessed.
export async function swapPositions(
  client: SupabaseClient,
  table: TableName,
  ownerId: string,
  a: Row,
  b: Row,
): Promise<Outcome<[Row, Row]>> {
  const first = await updateRecord(client, table, ownerId, a, { position: b.position });
  if (!first.ok) return first;
  const second = await updateRecord(client, table, ownerId, b, { position: a.position });
  if (!second.ok) return { ...second, reason: "conflict", message: "Only part of the move was saved. Reload to see the current order." };
  return { ok: true, value: [first.value, second.value] };
}

// ---------- Projects ----------

export const PROJECT_COLUMNS =
  "id, title, project_type, stage, publication_status, summary, goals, source_idea_id, created_at, updated_at, version, archived_at";

export function normalizeProjectTitle(input: string): string | null {
  const title = input.trim().replace(/\s+/g, " ");
  return title ? title.slice(0, 200) : null;
}

export async function createProject(
  client: SupabaseClient,
  ownerId: string,
  input: { title: string; project_type: string; summary?: string },
): Promise<Outcome<Project>> {
  const title = normalizeProjectTitle(input.title);
  if (!title) return invalid("Give the project a title.");
  if (!PROJECT_TYPES.some((t) => t.value === input.project_type)) return invalid("Choose Engineering, Story or Hybrid.");
  try {
    const { data, error } = await client
      .from("projects")
      .insert({ id: crypto.randomUUID(), user_id: ownerId, title, project_type: input.project_type, summary: (input.summary ?? "").slice(0, 5000) })
      .select(PROJECT_COLUMNS)
      .single();
    if (error) return describeFailure(error);
    return { ok: true, value: data as Project };
  } catch {
    return FAILED;
  }
}

async function projectFromIdea(client: SupabaseClient, ownerId: string, ideaId: string) {
  const { data, error } = await client
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("user_id", ownerId)
    .eq("source_idea_id", ideaId)
    .maybeSingle();
  if (error) throw error;
  return data as Project | null;
}

// Turns an idea into a project. The idea itself is left unchanged. Converting the same idea
// again (a retry, a second tab) returns the project that already exists.
export async function convertIdea(
  client: SupabaseClient,
  ownerId: string,
  idea: { id: string; title: string | null; content: string; status: string },
  projectType: string,
): Promise<Outcome<{ project: Project; existed: boolean }>> {
  if (!PROJECT_TYPES.some((t) => t.value === projectType)) return invalid("Choose Engineering, Story or Hybrid.");
  const firstLine = idea.content.split("\n").find((line) => line.trim()) ?? "";
  const title = normalizeProjectTitle(idea.title ?? "") ?? normalizeProjectTitle(firstLine) ?? "Untitled project";
  try {
    const existing = await projectFromIdea(client, ownerId, idea.id);
    if (existing) return { ok: true, value: { project: existing, existed: true } };
    const { data, error } = await client
      .from("projects")
      .insert({
        id: crypto.randomUUID(),
        user_id: ownerId,
        title,
        project_type: projectType,
        stage: (STAGES as readonly string[]).includes(idea.status) ? idea.status : "exploring",
        summary: idea.content.slice(0, 5000),
        source_idea_id: idea.id,
      })
      .select(PROJECT_COLUMNS)
      .single();
    if (error?.code === "23505") {
      const winner = await projectFromIdea(client, ownerId, idea.id);
      if (winner) return { ok: true, value: { project: winner, existed: true } };
    }
    if (error) return describeFailure(error);
    return { ok: true, value: { project: data as Project, existed: false } };
  } catch {
    return FAILED;
  }
}

export function saveProject(
  client: SupabaseClient,
  ownerId: string,
  base: Project,
  edit: { title: string; project_type: string; stage: string; publication_status: string; summary: string; goals: string },
): Promise<Outcome<Row>> {
  const title = normalizeProjectTitle(edit.title);
  if (!title) return Promise.resolve(invalid("Give the project a title."));
  if (!PROJECT_TYPES.some((t) => t.value === edit.project_type)) return Promise.resolve(invalid("Choose Engineering, Story or Hybrid."));
  if (!(STAGES as readonly string[]).includes(edit.stage)) return Promise.resolve(invalid("Choose one of the stages."));
  // Keeps a value set outside this page (for example "published") unless the owner changes it here.
  const publicationAllowed = (SETTABLE_PUBLICATION as readonly string[]).includes(edit.publication_status)
    || edit.publication_status === base.publication_status;
  if (!publicationAllowed) return Promise.resolve(invalid("Publishing to the public site isn't available yet."));
  if (edit.summary.length > 5000 || edit.goals.length > 10000) return Promise.resolve(invalid("The summary or goals are too long."));
  return updateRecord(client, "projects", ownerId, base, {
    title,
    project_type: edit.project_type,
    stage: edit.stage,
    publication_status: edit.publication_status,
    summary: edit.summary,
    goals: edit.goals,
  });
}

export function setProjectArchived(client: SupabaseClient, ownerId: string, base: Project, archived: boolean) {
  if ((base.archived_at !== null) === archived) return Promise.resolve(CONFLICT as Outcome<Row>);
  // The database replaces this timestamp with its own clock.
  return updateRecord(client, "projects", ownerId, base, { archived_at: archived ? new Date().toISOString() : null });
}
