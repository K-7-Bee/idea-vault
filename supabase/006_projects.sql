-- Phase 2A + 2B: projects and the Engineering Lab.
-- Additive only: no existing table, column or row is changed (one unique index is added to
-- ideas so a project can reference its source idea together with the owner).
-- Safe to run more than once. Run 005_idea_stages.sql first.
--
-- Privacy: every table is owner-only (row level security) and anonymous access is revoked.
-- Nothing here is public. "published" is stored for the later Portfolio Manager; the public
-- site does not read these tables.

begin;

-- The database owns ids, owners, timestamps and versions; values sent by a browser are ignored.
-- version increases on every update so the app can refuse to overwrite a newer save.
create or replace function public.vault_touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    if tg_argv[0] = 'project' then
      new.archived_at := null;
    end if;
    return new;
  end if;

  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.version := old.version + 1;

  if tg_argv[0] = 'project' then
    -- The source idea link can be cleared (idea deleted) but never pointed elsewhere.
    if new.source_idea_id is not null and new.source_idea_id is distinct from old.source_idea_id then
      new.source_idea_id := old.source_idea_id;
    end if;
    if new.archived_at is not null and old.archived_at is null then
      new.archived_at := now();
    elsif new.archived_at is not null then
      new.archived_at := old.archived_at;
    end if;
  else
    -- A record never moves to another project.
    new.project_id := old.project_id;
  end if;
  return new;
end;
$$;

-- Lets a project reference (idea id, owner) so it can only link to its owner's idea.
create unique index if not exists ideas_id_user_key on public.ideas (id, user_id);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  project_type text not null check (project_type in ('engineering', 'story', 'hybrid')),
  stage text not null default 'exploring'
    check (stage in ('exploring', 'analyzing', 'building', 'completed')),
  -- Independent of stage. Only completed AND published may ever be shown publicly.
  publication_status text not null default 'private'
    check (publication_status in ('private', 'ready', 'published')),
  summary text not null default '' check (char_length(summary) <= 5000),
  goals text not null default '' check (char_length(goals) <= 10000),
  source_idea_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  archived_at timestamptz,
  unique (id, user_id),
  foreign key (source_idea_id, user_id) references public.ideas (id, user_id)
    on delete set null (source_idea_id)
);
-- One project per idea: converting the same idea again finds the existing project.
create unique index if not exists projects_source_idea_key
  on public.projects (source_idea_id) where source_idea_id is not null;
create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  notes text not null default '' check (char_length(notes) <= 20000),
  due_on date,
  status text not null default 'open' check (status in ('open', 'done')),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (project_id, id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

create table if not exists public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  notes text not null default '' check (char_length(notes) <= 20000),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  milestone_id uuid,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, milestone_id) references public.project_milestones (project_id, id)
    on delete set null (milestone_id)
);

-- Technical notes, experiments, test evidence, results, lessons and decisions.
create table if not exists public.project_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  kind text not null check (kind in ('note', 'experiment', 'evidence', 'result', 'lesson', 'decision')),
  title text not null check (char_length(title) between 1 and 300),
  body text not null default '' check (char_length(body) <= 50000),
  link text check (link is null or (char_length(link) <= 2000 and link ~ '^https?://\S+$')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

-- Parts list. No prices: cost data is not invented or estimated here.
create table if not exists public.project_components (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  specification text not null default '' check (char_length(specification) <= 2000),
  quantity numeric check (quantity is null or quantity > 0),
  unit text not null default '' check (char_length(unit) <= 30),
  status text not null default 'needed' check (status in ('needed', 'ordered', 'have')),
  link text check (link is null or (char_length(link) <= 2000 and link ~ '^https?://\S+$')),
  notes text not null default '' check (char_length(notes) <= 5000),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

-- Code/repository links and references (used by Engineering Lab and Story Studio).
create table if not exists public.project_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  label text not null check (char_length(label) between 1 and 200),
  url text not null check (char_length(url) <= 2000 and url ~ '^https?://\S+$'),
  kind text not null default 'reference'
    check (kind in ('repository', 'code', 'documentation', 'reference', 'other')),
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

create index if not exists project_milestones_project_idx on public.project_milestones (project_id, position);
create index if not exists project_tasks_project_idx on public.project_tasks (project_id, position);
create index if not exists project_tasks_milestone_idx on public.project_tasks (project_id, milestone_id);
create index if not exists project_entries_project_idx on public.project_entries (project_id, created_at desc);
create index if not exists project_components_project_idx on public.project_components (project_id, position);
create index if not exists project_links_project_idx on public.project_links (project_id, created_at);

-- Owner-only access and server-owned fields for every table above.
do $$
declare
  t text;
begin
  foreach t in array array['projects', 'project_milestones', 'project_tasks', 'project_entries',
                           'project_components', 'project_links']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "owner can read" on public.%I', t);
    execute format('drop policy if exists "owner can add" on public.%I', t);
    execute format('drop policy if exists "owner can edit" on public.%I', t);
    execute format('drop policy if exists "owner can delete" on public.%I', t);
    execute format('create policy "owner can read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "owner can add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner can edit" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner can delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('drop trigger if exists vault_touch_row on public.%I', t);
    execute format('create trigger vault_touch_row before insert or update on public.%I for each row execute function public.vault_touch_row(%L)',
                   t, case when t = 'projects' then 'project' else 'child' end);
  end loop;
end $$;

commit;
