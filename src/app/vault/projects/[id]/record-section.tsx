"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { projectFileMeta, projectFileView, type ProjectFile } from "@/lib/project-files";
import {
  TABLES,
  UNIT_LEVELS,
  cleanValues,
  deleteRecord,
  insertRecord,
  nextPosition,
  sortRows,
  swapPositions,
  unitPath,
  unitRank,
  updateRecord,
  type Field,
  type Outcome,
  type Row,
  type TableConfig,
  type TableName,
} from "@/lib/workspace";

export const field =
  "w-full rounded-xl border border-line bg-field p-2.5 text-base text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";
const smallButton = "rounded-lg border border-line px-2.5 py-1 text-xs transition hover:bg-background disabled:opacity-40";

export type Records = Record<TableName, Row[]>;
export type Writer = {
  run: <T>(op: (client: SupabaseClient) => Promise<Outcome<T>>, done: string | null, onSuccess: (value: T) => void) => Promise<boolean>;
  busy: boolean;
  online: boolean;
  setMessage: (message: { text: string; error: boolean } | null) => void;
};
type Draft = Record<string, string>;

// After these are deleted the database clears or removes linked records, so reload those lists.
export const DEPENDENTS: Partial<Record<TableName, TableName[]>> = {
  project_milestones: ["project_tasks"],
  story_characters: ["story_relationships", "story_continuity"],
  story_units: ["story_timeline_events", "story_continuity"],
};
const DELETE_NOTE: Partial<Record<TableName, string>> = {
  project_milestones: " Its tasks are kept.",
  story_characters: " Relationships that name this character are removed too. Continuity records are kept but lose the character link.",
  story_units: " Timeline events and continuity records are kept but lose this scene/shot link.",
};

function emptyDraft(config: TableConfig): Draft {
  return Object.fromEntries(config.fields.map((f) => [f.name, f.kind === "select" ? f.options![0].value : ""]));
}
function draftFrom(config: TableConfig, row: Row): Draft {
  return Object.fromEntries(config.fields.map((f) => [f.name, row[f.name] === null || row[f.name] === undefined ? "" : String(row[f.name])]));
}

function refLabel(records: Records, f: Field, id: unknown): string {
  if (!id || !f.ref) return "";
  const rows = records[f.ref];
  if (f.ref === "story_units") return unitPath(rows, String(id)) || "(removed)";
  const row = rows.find((r) => r.id === id);
  return row ? String(row[TABLES[f.ref].titleField]) : "(removed)";
}

function refOptions(records: Records, f: Field, draft: Draft, selfId: string | null) {
  const rows = sortRows(TABLES[f.ref!], records[f.ref!]);
  if (f.ref === "story_units") {
    const usable = f.name === "parent_id"
      ? rows.filter((u) => u.id !== selfId && unitRank(u.kind) < unitRank(draft.kind))
      : rows;
    return usable.map((u) => ({ value: u.id, label: unitPath(records.story_units, u.id) }));
  }
  return rows.map((r) => ({ value: r.id, label: String(r[TABLES[f.ref!].titleField]) }));
}

function RecordForm({ config, records, draft, setDraft, selfId, submitLabel, writer, onSubmit, onCancel }: {
  config: TableConfig; records: Records; draft: Draft; setDraft: (d: Draft) => void; selfId: string | null;
  submitLabel: string; writer: Writer; onSubmit: () => void; onCancel: () => void;
}) {
  const id = (name: string) => `${config.table}-${selfId ?? "new"}-${name}`;
  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-background p-3 sm:grid-cols-2"
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
    >
      {config.fields.map((f) => {
        const wide = f.kind === "textarea" || f.name === config.titleField;
        const value = draft[f.name] ?? "";
        const set = (v: string) => {
          const next = { ...draft, [f.name]: v };
          // A level change can make the chosen parent invalid; clear it rather than fail on save.
          if (config.table === "story_units" && f.name === "kind" && next.parent_id) {
            const parent = records.story_units.find((u) => u.id === next.parent_id);
            if (!parent || unitRank(parent.kind) >= unitRank(v)) next.parent_id = "";
          }
          setDraft(next);
        };
        let control;
        if (f.kind === "textarea") {
          control = <textarea id={id(f.name)} rows={3} maxLength={f.max} value={value} onChange={(e) => set(e.target.value)} className={`${field} resize-y`} aria-describedby={f.hint ? `${id(f.name)}-hint` : undefined} />;
        } else if (f.kind === "select" || f.kind === "ref") {
          const options = f.kind === "select" ? f.options! : refOptions(records, f, draft, selfId);
          control = (
            <select id={id(f.name)} required={f.required} value={value} onChange={(e) => set(e.target.value)} className={field} aria-describedby={f.hint ? `${id(f.name)}-hint` : undefined}>
              {f.kind === "ref" && <option value="">{f.required ? "Choose…" : "None"}</option>}
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          );
        } else {
          const type = f.kind === "number" ? "number" : f.kind === "date" ? "date" : f.kind === "url" ? "url" : "text";
          control = (
            <input
              id={id(f.name)} type={type} required={f.required} maxLength={f.kind === "text" ? f.max : undefined}
              step={f.kind === "number" ? "any" : undefined} min={f.kind === "number" ? "0" : undefined}
              value={value} onChange={(e) => set(e.target.value)} className={field}
              aria-describedby={f.hint ? `${id(f.name)}-hint` : undefined}
            />
          );
        }
        return (
          <div key={f.name} className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}>
            <label htmlFor={id(f.name)} className="font-medium">{f.label}{!f.required && f.kind !== "select" && <span className="font-normal text-muted"> (optional)</span>}</label>
            {control}
            {f.hint && <span id={`${id(f.name)}-hint`} className="text-xs text-muted">{f.hint}</span>}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={writer.busy || !writer.online} className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40">
          {writer.busy ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-line px-4 py-2 text-sm text-muted transition hover:text-foreground">Cancel</button>
      </div>
    </form>
  );
}

function RowDetails({ config, row, records }: { config: TableConfig; row: Row; records: Records }) {
  const shown = config.fields.filter((f) => f.name !== config.titleField && f.name !== config.groupBy && f.name !== "unit" && !(config.table === "story_units" && (f.name === "kind" || f.name === "parent_id")));
  const items = shown.flatMap((f) => {
    const value = row[f.name];
    if (value === null || value === undefined || value === "") return [];
    let content: React.ReactNode = String(value);
    if (f.kind === "ref") content = refLabel(records, f, value);
    else if (f.kind === "select") content = f.options!.find((o) => o.value === value)?.label ?? String(value);
    else if (f.kind === "url") content = <a href={String(value)} target="_blank" rel="noreferrer noopener" className="break-all underline underline-offset-4">{String(value)}</a>;
    else if (f.name === "quantity") content = `${String(value)}${row.unit ? ` ${String(row.unit)}` : ""}`;
    return [{ f, content }];
  });
  if (!items.length) return null;
  return (
    <dl className="mt-2 grid gap-1.5 text-sm">
      {items.map(({ f, content }) => (
        <div key={f.name} className={f.kind === "textarea" ? "" : "flex flex-wrap gap-x-2"}>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">{f.label}</dt>
          <dd className={f.kind === "textarea" ? "whitespace-pre-wrap break-words" : "break-words"}>{content}</dd>
        </div>
      ))}
    </dl>
  );
}

function rowTitle(config: TableConfig, row: Row, records: Records) {
  if (config.table === "story_relationships") {
    const from = refLabel(records, config.fields[0], row.from_character_id);
    const to = refLabel(records, config.fields[2], row.to_character_id);
    return `${from} — ${String(row.relationship)} → ${to}`;
  }
  return String(row[config.titleField]);
}

export default function RecordSection({ table, records, ownerId, projectId, writer, update, reload, intro, layout = "list", files }: {
  table: TableName; records: Records; ownerId: string; projectId: string; writer: Writer;
  update: (table: TableName, change: (rows: Row[]) => Row[]) => void;
  reload: (tables: TableName[], done: string) => void;
  intro?: string; layout?: "list" | "board" | "tree";
  // Phase 3C: project files, listed under the lab entry or component they are attached to.
  files?: ProjectFile[];
}) {
  const attached = (rowId: string) => (files ?? []).filter((f) => (table === "project_entries" ? f.entry_id : f.component_id) === rowId);
  const config = TABLES[table];
  const rows = records[table];
  const [adding, setAdding] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const groupField = config.groupBy ? config.fields.find((f) => f.name === config.groupBy)! : null;
  const label = config.singular;

  function add(draft: Draft) {
    const clean = cleanValues(config, draft);
    if (!clean.ok) { writer.setMessage({ text: clean.message, error: true }); return; }
    const values = config.positioned ? { ...clean.values, position: nextPosition(rows) } : clean.values;
    void writer.run((c) => insertRecord(c, table, ownerId, projectId, values), `Added ${label}.`, (row) => {
      update(table, (list) => [...list, row]);
      setAdding(null);
    });
  }
  function save(row: Row, draft: Draft) {
    const clean = cleanValues(config, draft);
    if (!clean.ok) { writer.setMessage({ text: clean.message, error: true }); return; }
    void writer.run((c) => updateRecord(c, table, ownerId, row, clean.values), "Saved.", (saved) => {
      update(table, (list) => list.map((r) => (r.id === saved.id ? saved : r)));
      setEditing(null);
    });
  }
  function moveGroup(row: Row, value: string) {
    void writer.run((c) => updateRecord(c, table, ownerId, row, { [config.groupBy!]: value }), null, (saved) => {
      update(table, (list) => list.map((r) => (r.id === saved.id ? saved : r)));
    });
  }
  function remove(row: Row) {
    if (!window.confirm(`Delete this ${label}? This cannot be undone.${DELETE_NOTE[table] ?? ""}`)) return;
    void writer.run((c) => deleteRecord(c, table, ownerId, row), `Deleted ${label}.`, () => {
      update(table, (list) => list.filter((r) => r.id !== row.id));
      const dependents = DEPENDENTS[table];
      if (dependents) reload(dependents, `Deleted ${label}.`);
    });
  }
  function swap(a: Row, b: Row) {
    void writer.run((c) => swapPositions(c, table, ownerId, a, b), null, ([first, second]) => {
      update(table, (list) => list.map((r) => (r.id === first.id ? first : r.id === second.id ? second : r)));
    });
  }

  function card(row: Row, siblings: Row[], children?: React.ReactNode) {
    const index = siblings.findIndex((s) => s.id === row.id);
    if (editing?.id === row.id) {
      return (
        <li key={row.id} className="list-none">
          <RecordForm config={config} records={records} draft={editing.draft} setDraft={(d) => setEditing({ id: row.id, draft: d })}
            selfId={row.id} submitLabel="Save" writer={writer} onSubmit={() => save(row, editing.draft)} onCancel={() => setEditing(null)} />
        </li>
      );
    }
    const groupOptions = groupField?.options ?? [];
    const g = groupOptions.findIndex((o) => o.value === row[config.groupBy ?? ""]);
    const isShot = table === "story_units" && row.kind === "shot";
    const kindLabel = table === "story_units" ? TABLES.story_units.fields[0].options!.find((o) => o.value === row.kind)?.label : null;
    const disabled = writer.busy || !writer.online;
    return (
      <li key={row.id} className={`list-none rounded-xl border border-line bg-card p-3 shadow-sm ${isShot ? "flex flex-col" : ""}`}>
        {isShot && <div aria-hidden className="mb-2 aspect-video w-full rounded-lg border border-dashed border-line bg-background" />}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="min-w-0 break-words font-semibold">
            {kindLabel && <span className="mr-2 rounded-full border border-line px-2 py-0.5 text-xs font-medium text-muted">{kindLabel}</span>}
            {rowTitle(config, row, records)}
          </h4>
        </div>
        <RowDetails config={config} row={row} records={records} />
        {attached(row.id).length > 0 && (
          <ul aria-label={`Files attached to ${rowTitle(config, row, records)}`} className="mt-2 grid gap-1 text-sm">
            {attached(row.id).map((f) => {
              const view = projectFileView(f);
              return (
                <li key={f.id} className="flex flex-wrap items-baseline gap-x-2">
                  <a href={view.href} target="_blank" rel="noreferrer" className="break-words underline underline-offset-4">{f.name}</a>
                  <span className="text-xs text-muted">{f.state === "unavailable" ? "Unavailable in Drive" : projectFileMeta(f)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" className={smallButton} disabled={disabled} onClick={() => setEditing({ id: row.id, draft: draftFrom(config, row) })}>Edit</button>
          {groupField && g > 0 && (
            <button type="button" className={smallButton} disabled={disabled} onClick={() => moveGroup(row, groupOptions[g - 1].value)}>← {groupOptions[g - 1].label}</button>
          )}
          {groupField && g >= 0 && g < groupOptions.length - 1 && (
            <button type="button" className={smallButton} disabled={disabled} onClick={() => moveGroup(row, groupOptions[g + 1].value)}>{groupOptions[g + 1].label} →</button>
          )}
          {config.positioned && index > 0 && (
            <button type="button" className={smallButton} disabled={disabled} aria-label={`Move ${rowTitle(config, row, records)} up`} onClick={() => swap(row, siblings[index - 1])}>↑</button>
          )}
          {config.positioned && index >= 0 && index < siblings.length - 1 && (
            <button type="button" className={smallButton} disabled={disabled} aria-label={`Move ${rowTitle(config, row, records)} down`} onClick={() => swap(row, siblings[index + 1])}>↓</button>
          )}
          {table === "story_units" && unitRank(row.kind) < UNIT_LEVELS.length - 1 && (
            <button type="button" className={smallButton} disabled={disabled}
              onClick={() => setAdding({ ...emptyDraft(config), kind: UNIT_LEVELS[unitRank(row.kind) + 1], parent_id: row.id })}>
              + Add inside
            </button>
          )}
          <button type="button" className={`${smallButton} text-danger`} disabled={disabled} onClick={() => remove(row)}>Delete</button>
        </div>
        {children}
      </li>
    );
  }

  function tree(parent: string | null): React.ReactNode {
    const ids = new Set(rows.map((r) => r.id));
    const level = sortRows(config, rows.filter((r) => (parent === null ? !r.parent_id || !ids.has(String(r.parent_id)) : r.parent_id === parent)));
    if (!level.length) return null;
    const shotsOnly = level.every((r) => r.kind === "shot");
    return (
      <ul className={shotsOnly ? "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : `grid gap-3 ${parent ? "mt-3 border-l-2 border-line pl-3" : ""}`}>
        {level.map((row) => card(row, level, tree(row.id)))}
      </ul>
    );
  }

  let body: React.ReactNode;
  if (rows.length === 0) {
    body = <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No {config.plural.toLowerCase()} yet.</p>;
  } else if (layout === "tree") {
    body = tree(null);
  } else if (groupField) {
    body = (
      <div className={layout === "board" ? "grid gap-4 md:grid-cols-3" : "grid gap-5"}>
        {groupField.options!.map((o) => {
          const group = sortRows(config, rows.filter((r) => r[groupField.name] === o.value));
          if (layout !== "board" && group.length === 0) return null;
          return (
            <section key={o.value} aria-label={o.label} className={layout === "board" ? "rounded-2xl border border-line bg-background/60 p-3" : ""}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{o.label} ({group.length})</h4>
              <ul className="grid gap-2">{group.map((row) => card(row, group))}</ul>
            </section>
          );
        })}
      </div>
    );
  } else {
    const sorted = sortRows(config, rows);
    body = <ul className="grid gap-2">{sorted.map((row) => card(row, sorted))}</ul>;
  }

  const blockedReason = table === "story_relationships" && records.story_characters.length < 2
    ? "Add at least two characters to record a relationship." : null;

  return (
    <section aria-label={config.plural} className="mt-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{config.plural}</h3>
          {intro && <p className="text-sm text-muted">{intro}</p>}
        </div>
        {!adding && (
          <button type="button" disabled={writer.busy || !writer.online || !!blockedReason} onClick={() => setAdding(emptyDraft(config))}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40">
            + Add {label}
          </button>
        )}
      </div>
      {blockedReason && <p className="mb-3 text-sm text-muted">{blockedReason}</p>}
      {adding && (
        // Scrolls the form into view when it opens, e.g. from "+ Add inside" further down the list.
        <div className="mb-4 scroll-mt-4" ref={(el) => el?.scrollIntoView({ block: "nearest" })}>
          <RecordForm config={config} records={records} draft={adding} setDraft={setAdding} selfId={null}
            submitLabel={`Add ${label}`} writer={writer} onSubmit={() => add(adding)} onCancel={() => setAdding(null)} />
        </div>
      )}
      {body}
    </section>
  );
}
