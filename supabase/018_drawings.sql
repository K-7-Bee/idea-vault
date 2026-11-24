-- Phase 7A/7B: drawings (Pencil sketches on storyboard shots and scenes, and annotation layers on
-- existing project images). Additive only and safe to run more than once. Run 007, 011 and 012 first.
--
-- A drawing is vector data (pen strokes, arrows, labels) in `data`, owner-only like every Vault
-- table. It links to exactly one thing: a structure item (unit_id, for sketches) or one project
-- image (base_file_id, for annotations; at most one layer per image). The image itself is never
-- changed. Nothing here is public, and anon has no privileges. Like structure items, nothing
-- disappears by cascade: a shot or an image with drawings can't be removed until they are deleted
-- (deleting the whole project still removes them).

begin;

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  unit_id uuid,
  base_file_id uuid,
  title text not null default '' check (char_length(title) <= 200),
  aspect text not null default '16:9' check (aspect in ('16:9', '4:3', '1:1', '9:16', 'image')),
  data jsonb not null default '{"v":1,"items":[]}'::jsonb,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  -- A sketch belongs to a shot or scene; an annotation to one image (with the image's own shape).
  check (num_nonnulls(unit_id, base_file_id) = 1),
  check ((base_file_id is not null) = (aspect = 'image')),
  -- The editor keeps drawings well under this; the limit stops runaway or hostile payloads.
  check (pg_column_size(data) <= 2097152),
  check (jsonb_typeof(data) = 'object' and (data ->> 'v') = '1' and jsonb_typeof(data -> 'items') = 'array'),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, unit_id) references public.story_units (project_id, id) on delete no action
);

-- project_files has no (project_id, id) key yet; add one so an annotation can only point at an
-- image of the same project.
create unique index if not exists project_files_project_id_key on public.project_files (project_id, id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'drawings_base_file_fk') then
    alter table public.drawings add constraint drawings_base_file_fk
      foreign key (project_id, base_file_id) references public.project_files (project_id, id) on delete no action;
  end if;
end $$;

create unique index if not exists drawings_one_layer_per_image on public.drawings (base_file_id) where base_file_id is not null;
create index if not exists drawings_unit_idx on public.drawings (project_id, unit_id, position) where unit_id is not null;
create index if not exists drawings_project_idx on public.drawings (project_id, updated_at desc);

-- Sketches attach to scenes and shots only, not seasons or episodes.
create or replace function public.drawings_check_unit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k text;
begin
  if new.unit_id is not null then
    select kind into k from public.story_units where id = new.unit_id;
    if k is not null and k not in ('scene', 'shot') then
      raise exception 'Sketches belong to a scene or a shot.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- A drawing never changes what it belongs to.
    new.unit_id := old.unit_id;
    new.base_file_id := old.base_file_id;
    new.aspect := case when old.aspect = 'image' then 'image' else new.aspect end;
  end if;
  return new;
end;
$$;

drop trigger if exists drawings_check_unit on public.drawings;
create trigger drawings_check_unit before insert or update on public.drawings
  for each row execute function public.drawings_check_unit();

alter table public.drawings enable row level security;
revoke all on public.drawings from anon;
grant select, insert, update, delete on public.drawings to authenticated;
revoke truncate, references, trigger on public.drawings from authenticated;
drop policy if exists "owner can read" on public.drawings;
drop policy if exists "owner can add" on public.drawings;
drop policy if exists "owner can edit" on public.drawings;
drop policy if exists "owner can delete" on public.drawings;
create policy "owner can read" on public.drawings for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add" on public.drawings for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can edit" on public.drawings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.drawings for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists vault_touch_row on public.drawings;
create trigger vault_touch_row before insert or update on public.drawings
  for each row execute function public.vault_touch_row('child');

commit;
