-- Phase 3D: images on Story Studio characters and structure items (season/episode/scene/shot).
-- Additive only: two nullable link columns and a main-image flag on project_files, plus one
-- owner-scoped function to choose the main image. Safe to run more than once. Run 007 and 011 first.
-- story_characters and story_units already have unique (project_id, id), so links stay in-project.

begin;

alter table public.project_files add column if not exists character_id uuid;
alter table public.project_files add column if not exists unit_id uuid;
alter table public.project_files add column if not exists is_main boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_files_character_fk') then
    alter table public.project_files add constraint project_files_character_fk
      foreign key (project_id, character_id) references public.story_characters (project_id, id) on delete set null (character_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_files_unit_fk') then
    alter table public.project_files add constraint project_files_unit_fk
      foreign key (project_id, unit_id) references public.story_units (project_id, id) on delete set null (unit_id);
  end if;
  -- A file is attached to at most one record.
  if not exists (select 1 from pg_constraint where conname = 'project_files_one_record') then
    alter table public.project_files add constraint project_files_one_record
      check (num_nonnulls(entry_id, component_id, character_id, unit_id) <= 1);
  end if;
  -- Only an image on a character or structure item can be its main image.
  if not exists (select 1 from pg_constraint where conname = 'project_files_main_needs_record') then
    alter table public.project_files add constraint project_files_main_needs_record
      check (not is_main or num_nonnulls(character_id, unit_id) = 1);
  end if;
end $$;

-- One main image per character and per structure item.
create unique index if not exists project_files_main_character on public.project_files (character_id) where is_main;
create unique index if not exists project_files_main_unit on public.project_files (unit_id) where is_main;
create index if not exists project_files_character_idx on public.project_files (character_id) where character_id is not null;
create index if not exists project_files_unit_idx on public.project_files (unit_id) where unit_id is not null;

-- Moving a file to another record (or the record being deleted) drops its main-image status.
create or replace function public.project_files_main_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.character_id is distinct from old.character_id or new.unit_id is distinct from old.unit_id) then
    new.is_main := false;
  end if;
  if new.character_id is null and new.unit_id is null then
    new.is_main := false;
  end if;
  return new;
end;
$$;

drop trigger if exists project_files_main_rules on public.project_files;
create trigger project_files_main_rules before insert or update on public.project_files
  for each row execute function public.project_files_main_rules();

-- "Make main": in one transaction, clears the record's current main image and sets this one.
-- Security invoker, so row-level security limits it to the caller's own rows. Returns false when
-- the file isn't the caller's or isn't attached to a character or structure item.
create or replace function public.project_file_make_main(file_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  f public.project_files;
begin
  select * into f from public.project_files where id = file_id and user_id = (select auth.uid()) for update;
  if not found or (f.character_id is null and f.unit_id is null) then
    return false;
  end if;
  update public.project_files set is_main = false
   where user_id = f.user_id and is_main and id <> f.id
     and ((f.character_id is not null and character_id = f.character_id) or (f.unit_id is not null and unit_id = f.unit_id));
  update public.project_files set is_main = true where id = f.id;
  return true;
end;
$$;

revoke all on function public.project_file_make_main(uuid) from public;
revoke all on function public.project_file_make_main(uuid) from anon;
grant execute on function public.project_file_make_main(uuid) to authenticated;
revoke all on function public.project_files_main_rules() from public;

commit;
