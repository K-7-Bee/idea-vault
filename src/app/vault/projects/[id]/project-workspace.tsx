"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PROJECT_TYPES,
  PUBLICATION,
  SETTABLE_PUBLICATION,
  STAGES,
  TABLES,
  hasEngineering,
  hasStory,
  nextAction,
  saveProject,
  setProjectArchived,
  type Outcome,
  type Project,
  type Row,
  type TableName,
} from "@/lib/workspace";
import { STATUS_COLOR, STATUS_INFO } from "../../status";
import { LockedNotice, useVaultWriter } from "../../use-vault-writer";
import RecordSection, { field, type Records } from "./record-section";
import ProjectFiles from "./project-files";
import type { ProjectFile } from "@/lib/project-files";
import type { PickerConfig } from "@/lib/drive/picker";

type Tab = { id: string; label: string; tables: TableName[] };

function tabsFor(type: string): Tab[] {
  const tabs: Tab[] = [{ id: "overview", label: "Overview", tables: [] }];
  if (hasEngineering(type)) {
    tabs.push(
      { id: "tasks", label: "Task board", tables: ["project_tasks"] },
      { id: "milestones", label: "Milestones", tables: ["project_milestones"] },
      { id: "notebook", label: "Lab notebook", tables: ["project_entries"] },
      { id: "components", label: "Components", tables: ["project_components"] },
    );
  }
  if (hasStory(type)) {
    tabs.push(
      { id: "bible", label: "Story Bible", tables: ["story_bible_entries"] },
      { id: "characters", label: "Characters", tables: ["story_characters", "story_relationships"] },
      { id: "structure", label: "Structure", tables: ["story_units"] },
      { id: "timeline", label: "Timeline", tables: ["story_timeline_events"] },
      { id: "continuity", label: "Continuity", tables: ["story_continuity"] },
    );
  }
  tabs.push({ id: "links", label: hasEngineering(type) ? "Code & links" : "References", tables: ["project_links"] });
  tabs.push({ id: "files", label: "Files", tables: [] });
  return tabs;
}

const INTRO: Partial<Record<TableName, string>> = {
  project_tasks: "Move tasks across the board as work progresses. The first task in Doing (or else To do) becomes the project's next action.",
  project_entries: "Technical notes, experiments, test evidence, results, lessons and decisions, newest first. No simulation is required.",
  project_components: "Parts you need, have ordered or have in hand. Prices are not tracked here.",
  story_relationships: "How characters relate to each other.",
  story_units: "Seasons, episodes, scenes and shots. Every level is optional. Shots appear as panels inside their scene.",
  story_timeline_events: "Events in story order, optionally tied to the exact scene or shot.",
  story_continuity: "Details that must stay consistent, tied to an exact scene/shot and character.",
};

function when(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ProjectWorkspace({ ownerId, initialProject, initialRecords, sourceIdea, truncated, initialFiles = [], driveUploads = false, picker = { apiKey: "", appId: "" } }: {
  ownerId: string; initialProject: Project; initialRecords: Records;
  sourceIdea: { id: string; label: string } | null; truncated: TableName[];
  // Phase 3C: files in Google Drive, the upload switch and the Picker configuration.
  initialFiles?: ProjectFile[]; driveUploads?: boolean; picker?: PickerConfig;
}) {
  const [project, setProject] = useState(initialProject);
  const [records, setRecords] = useState(initialRecords);
  const [files, setFilesState] = useState(initialFiles);
  const setFiles = (change: (list: ProjectFile[]) => ProjectFile[]) => setFilesState(change);
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...initialProject }));
  const { run, busy, message, setMessage, online, locked, retry, region } = useVaultWriter(ownerId);
  const writer = { run, busy, online, setMessage };
  const tabs = tabsFor(project.project_type);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const archived = project.archived_at !== null;

  // The open tab lives in the address (#tasks) so reloads and the back button keep it.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (id) setTab(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);
  // Confirmations fade on their own; errors stay until dismissed or replaced.
  useEffect(() => {
    if (!message || message.error || message.keep) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message, setMessage]);
  function open(id: string) {
    setTab(id);
    setMessage(null);
    history.replaceState(null, "", id === "overview" ? window.location.pathname : `#${id}`);
  }

  function update(table: TableName, change: (rows: Row[]) => Row[]) {
    setRecords((all) => ({ ...all, [table]: change(all[table]) }));
  }
  function reload(tables: TableName[], done: string) {
    void run(async (client): Promise<Outcome<Partial<Records>>> => {
      try {
        const results = await Promise.all(tables.map((t) => client.from(t).select("*").eq("project_id", project.id).eq("user_id", ownerId).limit(1000)));
        if (results.some((r) => r.error || !r.data)) return { ok: false, reason: "failed", message: "Couldn't refresh linked records. Reload the page." };
        return { ok: true, value: Object.fromEntries(tables.map((t, i) => [t, results[i].data as Row[]])) };
      } catch {
        return { ok: false, reason: "failed", message: "Couldn't refresh linked records. Reload the page." };
      }
    }, done, (fresh) => setRecords((all) => ({ ...all, ...fresh })));
  }

  const next = nextAction(records.project_tasks);
  const publication = PUBLICATION.find((p) => p.value === project.publication_status)?.label ?? project.publication_status;
  const publicationChoices = PUBLICATION.filter((p) =>
    (SETTABLE_PUBLICATION as readonly string[]).includes(p.value) || p.value === project.publication_status);
  const disabled = busy || !online;

  return (
    <>
      {locked && <LockedNotice retry={retry} />}
      <div ref={region} hidden={locked} inert={locked} style={locked ? { display: "none" } : undefined}>
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <Link href="/vault/projects" className="text-muted underline-offset-4 hover:text-foreground hover:underline">← Project Library</Link>
        </nav>

        <header className="relative overflow-hidden rounded-2xl border border-line bg-card p-5 pl-6 shadow-sm">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: STATUS_COLOR[project.stage] }} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="min-w-0 break-words text-2xl font-bold">{project.title}</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-line px-3 py-1">{PROJECT_TYPES.find((t) => t.value === project.project_type)?.label}</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[project.stage] }} />
                {STATUS_INFO[project.stage]?.label ?? project.stage}
              </span>
              <span className="rounded-full border border-line px-3 py-1 text-muted">{publication}</span>
            </div>
          </div>
          {archived && (
            <p className="mt-3 text-sm" suppressHydrationWarning>
              Archived {when(project.archived_at!)}. Nothing in it was deleted. Restore it from the Overview tab.
            </p>
          )}
        </header>

        <nav aria-label="Project sections" className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={t.id === current.id ? "page" : undefined}
              onClick={() => open(t.id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${t.id === current.id ? "bg-accent text-on-accent" : "text-muted hover:bg-card hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {truncated.length > 0 && (
          <p role="status" className="mt-3 text-sm text-muted">
            Very large lists are cut off at 1000 items: {truncated.map((t) => TABLES[t].plural).join(", ")}.
          </p>
        )}
        {!online && <p className="mt-3 text-sm text-muted">You&apos;re offline. Viewing works; changes need a connection.</p>}

        <div className="mt-4">
          {current.id === "overview" ? (
            <section aria-label="Overview" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="rounded-2xl border border-line bg-card p-5">
                {editing ? (
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run((c) => saveProject(c, ownerId, project, draft), "Saved.", (saved) => {
                        setProject(saved as unknown as Project);
                        setEditing(false);
                      });
                    }}
                  >
                    <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
                      Title
                      <input required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={field} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Type
                      <select value={draft.project_type} onChange={(e) => setDraft({ ...draft, project_type: e.target.value as Project["project_type"] })} className={field}>
                        {PROJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Stage
                      <select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })} className={field}>
                        {STAGES.map((s) => <option key={s} value={s}>{STATUS_INFO[s]?.label ?? s}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-col gap-1 text-sm sm:col-span-2">
                      <label htmlFor="project-showcase" className="font-medium">Showcase</label>
                      <select id="project-showcase" value={draft.publication_status} onChange={(e) => setDraft({ ...draft, publication_status: e.target.value })} className={field} aria-describedby="publication-hint">
                        {publicationChoices.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                      <span id="publication-hint" className="text-muted">
                        Separate from the stage. Nothing is published to your public site from here; only completed and published projects will ever be eligible.
                      </span>
                    </div>
                    <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
                      Summary
                      <textarea rows={4} maxLength={5000} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} className={`${field} resize-y`} />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
                      Goals
                      <textarea rows={4} maxLength={10000} value={draft.goals} onChange={(e) => setDraft({ ...draft, goals: e.target.value })} className={`${field} resize-y`} />
                    </label>
                    {draft.project_type !== project.project_type && (
                      <p className="text-sm text-muted sm:col-span-2">Changing the type only changes which tabs are shown. No records are deleted.</p>
                    )}
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button type="submit" disabled={disabled} className="rounded-xl bg-accent px-5 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40">
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button type="button" onClick={() => { setEditing(false); setMessage(null); }} className="rounded-xl border border-line px-4 py-2 text-muted transition hover:text-foreground">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Summary</h3>
                    <p className={`mt-1 whitespace-pre-wrap break-words ${project.summary ? "" : "text-muted"}`}>{project.summary || "No summary yet."}</p>
                    <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-muted">Goals</h3>
                    <p className={`mt-1 whitespace-pre-wrap break-words ${project.goals ? "" : "text-muted"}`}>{project.goals || "No goals written yet."}</p>
                    <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
                      {!archived && (
                        <button type="button" disabled={disabled} onClick={() => { setDraft({ ...project }); setMessage(null); setEditing(true); }}
                          className="rounded-xl bg-accent px-4 py-2 font-medium text-on-accent transition hover:brightness-105 disabled:opacity-40">
                          Edit project
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void run((c) => setProjectArchived(c, ownerId, project, !archived),
                          archived ? "Restored." : "Archived. Nothing was deleted; restore it any time.",
                          (saved) => setProject(saved as unknown as Project))}
                        className="rounded-xl border border-line px-4 py-2 transition hover:bg-background disabled:opacity-40"
                      >
                        {archived ? "Restore project" : "Archive project"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <aside className="grid content-start gap-4">
                {hasEngineering(project.project_type) && (
                  <div className="rounded-2xl border border-line bg-card p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Resume project</h3>
                    {next ? (
                      <p className="mt-2">
                        <span className="text-xs text-muted">{next.status === "doing" ? "In progress" : "Next to do"}: </span>
                        <button type="button" className="break-words text-left font-semibold underline-offset-4 hover:underline" onClick={() => open("tasks")}>
                          {String(next.title)}
                        </button>
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted">No open tasks. Add one on the task board.</p>
                    )}
                  </div>
                )}
                <div className="rounded-2xl border border-line bg-card p-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">In this project</h3>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {tabs.filter((t) => t.tables.length).map((t) => (
                      <li key={t.id} className="flex justify-between gap-2">
                        <button type="button" className="underline-offset-4 hover:underline" onClick={() => open(t.id)}>{t.label}</button>
                        <span className="tabular-nums text-muted">{t.id === "files" ? files.length : t.tables.reduce((n, table) => n + records[table].length, 0)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <dl className="grid gap-2 rounded-2xl border border-line bg-card p-4 text-sm">
                  {sourceIdea && (
                    <div><dt className="text-muted">Started from idea</dt><dd><Link className="break-words underline underline-offset-4" href={`/vault/ideas/${sourceIdea.id}`}>{sourceIdea.label}</Link></dd></div>
                  )}
                  <div><dt className="text-muted">Created</dt><dd suppressHydrationWarning>{when(project.created_at)}</dd></div>
                  <div><dt className="text-muted">Last updated</dt><dd suppressHydrationWarning>{when(project.updated_at)}</dd></div>
                </dl>
              </aside>
            </section>
          ) : current.id === "files" ? (
            <ProjectFiles ownerId={ownerId} projectId={project.id} files={files} setFiles={setFiles}
              entries={hasEngineering(project.project_type) ? records.project_entries : []}
              components={hasEngineering(project.project_type) ? records.project_components : []}
              writer={writer} driveUploads={driveUploads} picker={picker} />
          ) : (
            <div className="grid gap-8">
              {current.tables.map((table) => (
                <RecordSection
                  key={table}
                  table={table}
                  records={records}
                  ownerId={ownerId}
                  projectId={project.id}
                  writer={writer}
                  update={update}
                  reload={reload}
                  intro={INTRO[table]}
                  layout={table === "project_tasks" ? "board" : table === "story_units" ? "tree" : "list"}
                  files={table === "project_entries" || table === "project_components" ? files : undefined}
                />
              ))}
            </div>
          )}
        </div>

        {message && (
          <div className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-3 shadow-lg">
            <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-danger" : "text-muted"}`}>
              {message.text}
            </p>
            {message.error && (
              <button type="button" className="text-sm underline" onClick={() => window.location.reload()}>Reload page</button>
            )}
            <button type="button" className="ml-auto text-sm text-muted underline" onClick={() => setMessage(null)}>Dismiss</button>
          </div>
        )}
      </div>
    </>
  );
}
