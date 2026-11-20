-- Phase 3C: files on projects (uploaded to Drive, or existing Drive files linked in place).
-- Additive only: two new tables and two unique indexes on existing tables (their id is already the
-- primary key, so the indexes always hold). Safe to run more than once. Run 006 and 010 first.
-- Owner-only; anon gets nothing; no TRUNCATE/REFERENCES/TRIGGER for authenticated (as in 010).

begin;

-- Lets a file reference an entry or component only within the same project.
create unique index if not exists project_entries_project_id_key on public.project_entries (project_id, id);
create unique index if not exists project_components_project_id_key on public.project_components (project_id, id);

-- Drive folder IDs the Vault created: the "Projects" folder inside the owner's chosen folder, and
-- one folder per project inside that. Kept off public.projects so creating a folder never bumps a
-- project's version and collides with the owner's edits. Names live only in Drive.
create table if not exists public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('projects_root', 'project')),
  parent_folder_id text not null check (parent_folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  project_id uuid,
  folder_id text not null check (folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  created_at timestamptz not null default now(),
  check ((purpose = 'project') = (project_id is not null)),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);
-- One of each per parent: choosing a different Vault folder later starts fresh folders there.
create unique index if not exists drive_folders_root_key
  on public.drive_folders (user_id, parent_folder_id) where purpose = 'projects_root';
create unique index if not exists drive_folders_project_key
  on public.drive_folders (project_id, parent_folder_id) where purpose = 'project';

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  entry_id uuid,
  component_id uuid,
  source text not null check (source in ('upload', 'picked')),
  drive_file_id text not null check (drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  name text not null check (char_length(name) between 1 and 500),
  mime_type text check (mime_type is null or char_length(mime_type) <= 255),
  -- Google Docs/Sheets/Slides have no byte size or checksum.
  size bigint check (size is null or size >= 0),
  md5 text check (md5 is null or md5 ~ '^[0-9a-f]{32}$'),
  state text not null default 'ok' check (state in ('ok', 'unavailable')),
  state_reason text check (state_reason is null or state_reason in ('trashed', 'missing', 'no_access')),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'ok') = (state_reason is null)),
  unique (project_id, drive_file_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, entry_id) references public.project_entries (project_id, id) on delete set null (entry_id),
  foreign key (project_id, component_id) references public.project_components (project_id, id) on delete set null (component_id)
);
create index if not exists project_files_project_idx on public.project_files (project_id, created_at desc);

-- The database owns identity and timestamps; a link never moves to another project or Drive file.
create or replace function public.project_files_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.project_id := old.project_id;
  new.source := old.source;
  new.drive_file_id := old.drive_file_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists project_files_touch on public.project_files;
create trigger project_files_touch before insert or update on public.project_files
  for each row execute function public.project_files_touch();

do $$
declare
  t text;
begin
  foreach t in array array['project_files', 'drive_folders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
    execute format('drop policy if exists "owner can read" on public.%I', t);
    execute format('drop policy if exists "owner can add" on public.%I', t);
    execute format('drop policy if exists "owner can edit" on public.%I', t);
    execute format('drop policy if exists "owner can delete" on public.%I', t);
    execute format('create policy "owner can read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "owner can add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner can delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Folder rows are never edited; file rows are (record link, name refresh, availability).
revoke update on public.drive_folders from authenticated;
grant select, insert, delete on public.drive_folders to authenticated;
grant select, insert, update, delete on public.project_files to authenticated;
create policy "owner can edit" on public.project_files for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

commit;
