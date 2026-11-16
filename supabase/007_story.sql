-- Phase 2C: Story Studio (text and structure; images arrive with Google Drive in a later phase).
-- Additive only and safe to run more than once. Run 006_projects.sql first.
-- Story records belong to a project of type story or hybrid; owner-only like everything else.

begin;

-- Story Bible: premise, world, rules, tone, themes.
create table if not exists public.story_bible_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  section text not null default 'other'
    check (section in ('premise', 'world', 'rules', 'tone', 'themes', 'other')),
  title text not null check (char_length(title) between 1 and 300),
  body text not null default '' check (char_length(body) <= 50000),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

-- Character Bible.
create table if not exists public.story_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  role text not null default '' check (char_length(role) <= 200),
  description text not null default '' check (char_length(description) <= 20000),
  traits text not null default '' check (char_length(traits) <= 5000),
  arc text not null default '' check (char_length(arc) <= 10000),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (project_id, id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

-- Character relationships. Removing a character removes the relationships that name it.
create table if not exists public.story_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  from_character_id uuid not null,
  to_character_id uuid not null,
  relationship text not null check (char_length(relationship) between 1 and 200),
  notes text not null default '' check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (from_character_id <> to_character_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, from_character_id) references public.story_characters (project_id, id) on delete cascade,
  foreign key (project_id, to_character_id) references public.story_characters (project_id, id) on delete cascade
);

-- Optional Season -> Episode -> Scene -> Shot hierarchy. Levels may be skipped (a scene can sit
-- at the top), but a unit can only sit inside a higher level. A unit that still contains
-- others cannot be deleted, so nothing disappears by cascade.
create table if not exists public.story_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  parent_id uuid,
  kind text not null check (kind in ('season', 'episode', 'scene', 'shot')),
  title text not null check (char_length(title) between 1 and 300),
  summary text not null default '' check (char_length(summary) <= 20000),
  location text not null default '' check (char_length(location) <= 300),
  time_of_day text not null default '' check (char_length(time_of_day) <= 100),
  camera text not null default '' check (char_length(camera) <= 2000),
  duration_seconds numeric check (duration_seconds is null or duration_seconds > 0),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (parent_id is null or parent_id <> id),
  unique (project_id, id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, parent_id) references public.story_units (project_id, id) on delete restrict
);

create or replace function public.story_units_check_level()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ranks constant text[] := array['season', 'episode', 'scene', 'shot'];
  parent_kind text;
  deepest_child int;
begin
  if new.parent_id is not null then
    select kind into parent_kind from public.story_units where id = new.parent_id;
    if parent_kind is not null and array_position(ranks, parent_kind) >= array_position(ranks, new.kind) then
      raise exception 'A % cannot be placed inside a %.', new.kind, parent_kind using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    select min(array_position(ranks, kind)) into deepest_child from public.story_units where parent_id = new.id;
    if deepest_child is not null and deepest_child <= array_position(ranks, new.kind) then
      raise exception 'This % contains items that cannot sit inside a %.', old.kind, new.kind using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists story_units_check_level on public.story_units;
create trigger story_units_check_level
  before insert or update of parent_id, kind on public.story_units
  for each row execute function public.story_units_check_level();

-- In-story timeline. An event may point at the exact scene or shot it happens in.
create table if not exists public.story_timeline_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  title text not null check (char_length(title) between 1 and 300),
  story_time text not null default '' check (char_length(story_time) <= 200),
  description text not null default '' check (char_length(description) <= 20000),
  unit_id uuid,
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, unit_id) references public.story_units (project_id, id) on delete set null (unit_id)
);

-- Continuity records: facts to keep consistent, tied to an exact scene/shot and/or character.
create table if not exists public.story_continuity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  subject text not null check (char_length(subject) between 1 and 300),
  detail text not null default '' check (char_length(detail) <= 20000),
  unit_id uuid,
  character_id uuid,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, unit_id) references public.story_units (project_id, id) on delete set null (unit_id),
  foreign key (project_id, character_id) references public.story_characters (project_id, id)
    on delete set null (character_id)
);

create index if not exists story_bible_project_idx on public.story_bible_entries (project_id, position);
create index if not exists story_characters_project_idx on public.story_characters (project_id, position);
create index if not exists story_relationships_project_idx on public.story_relationships (project_id);
create index if not exists story_units_parent_idx on public.story_units (project_id, parent_id, position);
create index if not exists story_timeline_project_idx on public.story_timeline_events (project_id, position);
create index if not exists story_continuity_project_idx on public.story_continuity (project_id, created_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['story_bible_entries', 'story_characters', 'story_relationships', 'story_units',
                           'story_timeline_events', 'story_continuity']
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
    execute format('create trigger vault_touch_row before insert or update on public.%I for each row execute function public.vault_touch_row(%L)', t, 'child');
  end loop;
end $$;

commit;
