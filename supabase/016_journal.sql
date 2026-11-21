-- Phase 4D: the Journal. Short engineering notes, each published (or not) on its own.
-- Additive apart from widening the 015 trigger that protects library files in use. Safe to run
-- more than once. Run 013 (showcases), 014 (site owner) and 015 (library) first.
--
-- Privacy model (same shape as 4A):
--   * journal_entries holds the owner's private drafts (owner-only).
--   * journal_published holds one public snapshot per published entry, written only by
--     publish_journal_entry / unpublish_journal_entry. Visitors can't read the table at all; they
--     call journal_public(), which returns public fields only.
--   * An entry may name a project. journal_public() shows that project's slug and title only while
--     the project is public right now (it has a showcases row) or is one of the three hand-written
--     case studies. A private project is never named, and project ids never leave the database.
--   * Images are library files (015). Their public copies (no metadata) are made by the server at
--     publish; the snapshot holds only the copies' names.

begin;

create or replace function public.journal_slug_ok(slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60;
$$;

-- Plain text of at most max_len characters with no HTML-like tags.
create or replace function public.journal_text_ok(v text, max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v is not null and char_length(v) <= max_len and v !~ '<[A-Za-z/!]';
$$;

-- [{"file": "<library id or public copy name>", "alt": "..."}], at most 4.
create or replace function public.journal_images_ok(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= 4
    and not exists (select 1 from jsonb_array_elements(v) i
                    where jsonb_typeof(i) <> 'object' or jsonb_typeof(i -> 'file') <> 'string' or jsonb_typeof(i -> 'alt') <> 'string'
                       or char_length(i ->> 'alt') > 200 or (i ->> 'alt') ~ '<[A-Za-z/!]'
                       or not ((i ->> 'file') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                               or (i ->> 'file') ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$')), false);
$$;

-- The slug and image checks run inside journal_entries' check constraints, so the owner's role must
-- be able to execute them (found by tests/sql/phase4d-behaviour.sql). They reveal nothing.
revoke all on function public.journal_slug_ok(text) from public, anon;
revoke all on function public.journal_images_ok(jsonb) from public, anon;
grant execute on function public.journal_slug_ok(text) to authenticated;
grant execute on function public.journal_images_ok(jsonb) to authenticated;
revoke all on function public.journal_text_ok(text, integer) from public, anon, authenticated;

-- ---------- Private drafts ----------

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null default '' check (slug = '' or public.journal_slug_ok(slug)),
  title text not null default '' check (char_length(title) <= 120),
  summary text not null default '' check (char_length(summary) <= 300),
  body text not null default '' check (char_length(body) <= 12000),
  entry_date text not null default '' check (char_length(entry_date) <= 40),
  -- One of the owner's projects, or one of the three hand-written case studies, or neither.
  project_id uuid,
  case_study text not null default '' check (case_study in ('', 'waste-to-energy-lighting', 'cha-restaurant', 'idea-vault')),
  images jsonb not null default '[]' check (public.journal_images_ok(images)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (project_id is null or case_study = ''),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete set null (project_id)
);
create index if not exists journal_entries_user_idx on public.journal_entries (user_id, updated_at desc);

alter table public.journal_entries enable row level security;
revoke all on public.journal_entries from anon;
grant select, insert, update, delete on public.journal_entries to authenticated;
revoke truncate, references, trigger on public.journal_entries from authenticated;
drop policy if exists "owner can read" on public.journal_entries;
drop policy if exists "owner can add" on public.journal_entries;
drop policy if exists "owner can edit" on public.journal_entries;
drop policy if exists "owner can delete" on public.journal_entries;
create policy "owner can read" on public.journal_entries for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add" on public.journal_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can edit" on public.journal_entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.journal_entries for delete to authenticated using (user_id = (select auth.uid()));

-- Server-owned id, owner, timestamps and version. A published entry keeps its address: changing
-- the slug of a published entry is refused (unpublish first). Security definer only to see
-- journal_published, which the owner can't read in full.
create or replace function public.journal_entries_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.version := 1;
    return new;
  end if;
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.version := old.version + 1;
  if new.slug is distinct from old.slug
     and exists (select 1 from public.journal_published p where p.entry_id = old.id and p.slug <> new.slug) then
    raise exception 'This entry is published at its current address. Unpublish it before changing the address.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.journal_entries_touch() from public, anon, authenticated;
drop trigger if exists journal_entries_touch on public.journal_entries;
create trigger journal_entries_touch before insert or update on public.journal_entries
  for each row execute function public.journal_entries_touch();

-- ---------- Public snapshots ----------

create table if not exists public.journal_published (
  entry_id uuid primary key references public.journal_entries (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique check (public.journal_slug_ok(slug)),
  title text not null check (char_length(title) between 1 and 120),
  summary text not null default '' check (char_length(summary) <= 300),
  body text not null check (char_length(body) between 1 and 12000),
  entry_date text not null default '' check (char_length(entry_date) <= 40),
  project_id uuid,
  case_study text not null default '',
  -- [{"file": "<public copy name>", "alt": "..."}] in the public "profile-files" bucket.
  images jsonb not null default '[]' check (public.journal_images_ok(images)),
  -- The draft version that was published, so the Vault can tell when the draft has moved on.
  draft_version integer not null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_published enable row level security;
revoke all on public.journal_published from anon, authenticated;
-- The owner sees which entries are published (and their images, for clean-up); visitors use journal_public().
grant select (entry_id, slug, images, draft_version, published_at, updated_at) on public.journal_published to authenticated;
drop policy if exists "owner can read" on public.journal_published;
create policy "owner can read" on public.journal_published for select to authenticated using (user_id = (select auth.uid()));

-- A published entry can't be deleted; unpublish it first, so the homepage's Journal link never
-- outlives the last entry. Account deletion (a cascade) isn't blocked.
create or replace function public.journal_entries_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if exists (select 1 from public.journal_published p where p.entry_id = old.id) then
    raise exception 'This entry is published. Unpublish it before deleting it.' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.journal_entries_guard_delete() from public, anon, authenticated;
drop trigger if exists journal_entries_guard_delete on public.journal_entries;
create trigger journal_entries_guard_delete before delete on public.journal_entries
  for each row execute function public.journal_entries_guard_delete();

-- ---------- Public read ----------

-- Published entries, newest first; one entry when p_slug is given. The project is named only
-- while it is public: a published showcase (whose row exists only while the project is completed,
-- published and not archived) or a hand-written case study (title filled in by the app).
create or replace function public.journal_public(p_slug text default null)
returns table (slug text, title text, summary text, body text, entry_date text, images jsonb,
               project_slug text, project_title text, published_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select j.slug, j.title, j.summary, j.body, j.entry_date, j.images,
         coalesce(s.slug, nullif(j.case_study, '')), s.title,
         j.published_at, j.updated_at
  from public.journal_published j
  left join public.showcases s on s.project_id = j.project_id and s.user_id = j.user_id
  where p_slug is null or j.slug = p_slug
  order by j.published_at desc
  limit 200;
$$;
revoke all on function public.journal_public(text) from public;
grant execute on function public.journal_public(text) to anon, authenticated;

-- ---------- Publish and unpublish ----------

-- Publishes exactly the draft version the owner confirmed. Each image must be one of the owner's
-- library images with a public copy in place (the publish route makes it). Returns published_at.
create or replace function public.publish_journal_entry(p_entry uuid, p_draft_version integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e public.journal_entries;
  pub_images jsonb := '[]'::jsonb;
  img jsonb;
  public_name text;
  stamp timestamptz := now();
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.site_owner o where o.user_id = uid) then
    raise exception 'Only the site owner can publish journal entries.' using errcode = '42501';
  end if;
  select * into e from public.journal_entries where id = p_entry and user_id = uid for update;
  if not found or e.version <> p_draft_version then
    raise exception 'The entry changed since you checked it. Review it again before publishing.' using errcode = '40001';
  end if;
  if e.slug = '' or btrim(e.title) = '' or btrim(e.body) = ''
     or not public.journal_text_ok(e.title, 120) or not public.journal_text_ok(e.summary, 300)
     or not public.journal_text_ok(e.body, 12000) or not public.journal_text_ok(e.entry_date, 40) then
    raise exception 'An entry needs an address, a title and some text, in plain text without HTML tags.' using errcode = '23514';
  end if;
  if exists (select 1 from public.journal_published p where p.slug = e.slug and p.entry_id <> e.id) then
    raise exception 'Another published entry already uses this address.' using errcode = '23505';
  end if;

  for img in select value from jsonb_array_elements(e.images) loop
    if btrim(img ->> 'alt') = '' then
      raise exception 'Describe every image.' using errcode = '23514';
    end if;
    select l.public_path into public_name from public.library_files l
    where l.id::text = img ->> 'file' and l.user_id = uid and l.kind = 'image';
    if public_name is null
       or not exists (select 1 from storage.objects o where o.bucket_id = 'profile-files' and o.name = public_name) then
      raise exception 'An image is not ready to publish. Choose it again and retry.' using errcode = '55000';
    end if;
    pub_images := pub_images || jsonb_build_array(jsonb_build_object('file', public_name, 'alt', btrim(img ->> 'alt')));
  end loop;

  insert into public.journal_published (entry_id, user_id, slug, title, summary, body, entry_date, project_id, case_study,
                                        images, draft_version, published_at, updated_at)
  values (e.id, uid, e.slug, btrim(e.title), btrim(e.summary), btrim(e.body), btrim(e.entry_date), e.project_id, e.case_study,
          pub_images, e.version, stamp, stamp)
  on conflict (entry_id) do update
    set slug = excluded.slug, title = excluded.title, summary = excluded.summary, body = excluded.body,
        entry_date = excluded.entry_date, project_id = excluded.project_id, case_study = excluded.case_study,
        images = excluded.images, draft_version = excluded.draft_version, updated_at = excluded.updated_at;
  return stamp;
end;
$$;

create or replace function public.unpublish_journal_entry(p_entry uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.site_owner o where o.user_id = uid) then
    raise exception 'Only the site owner can unpublish journal entries.' using errcode = '42501';
  end if;
  delete from public.journal_published where entry_id = p_entry and user_id = uid;
  return found;
end;
$$;

revoke all on function public.publish_journal_entry(uuid, integer) from public, anon;
revoke all on function public.unpublish_journal_entry(uuid) from public, anon;
grant execute on function public.publish_journal_entry(uuid, integer) to authenticated;
grant execute on function public.unpublish_journal_entry(uuid) to authenticated;

-- ---------- Library files in use (015, widened) ----------

create or replace function public.library_files_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Deleting the whole account cascades here; don't block that.
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  if old.public_path is not null then
    raise exception 'This file is on your public site. Take it off and publish first.' using errcode = '23503';
  end if;
  if exists (select 1 from public.profile_drafts d
             where d.user_id = old.user_id
               and (d.content #>> '{resume,file}' = old.id::text or d.content #>> '{photo,file}' = old.id::text)) then
    raise exception 'The profile draft uses this file. Remove it from the draft first.' using errcode = '23503';
  end if;
  if exists (select 1 from public.journal_entries j, jsonb_array_elements(j.images) i
             where j.user_id = old.user_id and i ->> 'file' = old.id::text) then
    raise exception 'A journal entry uses this file. Remove it from the entry first.' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.library_files_in_use() from public, anon, authenticated;

commit;
