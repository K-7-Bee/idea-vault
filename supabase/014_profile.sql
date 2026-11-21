-- Phase 4B: the public profile (homepage text) edited in the Vault.
-- Additive: four new tables and three functions. No existing table changes. Safe to run more than once.
--
-- Privacy model (same shape as 013):
--   * site_owner names the one account allowed to publish the profile. The app's email allowlist
--     lives only in the web server, so without this any other signed-in account could overwrite the
--     homepage through the API. It is filled automatically when exactly one Auth account exists;
--     otherwise an administrator inserts it by hand.
--   * profile_drafts holds the owner's private draft (owner-only, like every other Vault table).
--   * profile_published holds the one published copy. Anonymous visitors may read only its content
--     and published_at columns. Nobody can write it directly; publish_profile does.
--   * profile_versions keeps every published copy (owner-readable, append-only) for rollback.

begin;

-- ---------- Site owner ----------

create table if not exists public.site_owner (
  id boolean primary key default true check (id),
  user_id uuid not null references auth.users (id) on delete cascade
);
alter table public.site_owner enable row level security;
revoke all on public.site_owner from anon, authenticated;
insert into public.site_owner (user_id)
select u.id from auth.users u where (select count(*) from auth.users) = 1
on conflict (id) do nothing;

-- ---------- Content checks ----------

-- A string of at most max characters (and at least one when required), with no HTML-like tags.
-- The homepage renders text as text; this is a second line of defence.
create or replace function public.profile_text_ok(v jsonb, max_len integer, required boolean default false)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'string'
     and char_length(v #>> '{}') <= max_len
     and (not required or char_length(btrim(v #>> '{}')) > 0)
     and (v #>> '{}') !~ '<[A-Za-z/!]', false);
$$;

-- An array of at most max_items non-empty strings, each within max_len.
create or replace function public.profile_list_ok(v jsonb, max_items integer, max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= max_items
     and not exists (select 1 from jsonb_array_elements(v) x where not public.profile_text_ok(x, max_len, true)), false);
$$;

create or replace function public.profile_https_ok(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 2000 and (v #>> '{}') ~ '^https://[^[:space:]<>"]+$', false);
$$;

-- Null when the content can be published, otherwise the first problem in plain words.
create or replace function public.profile_content_problem(c jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  x jsonb;
  email jsonb;
begin
  if jsonb_typeof(c) <> 'object' or octet_length(c::text) > 100000 then
    return 'The profile is not in the expected form.';
  end if;
  if exists (select 1 from jsonb_object_keys(c) k
             where k not in ('name', 'hero', 'highlights', 'about', 'timeline', 'certificates', 'focus', 'links', 'contact')) then
    return 'The profile has an unknown section.';
  end if;
  if not public.profile_text_ok(c -> 'name', 80, true) then return 'Add your name (up to 80 characters).'; end if;

  x := c -> 'hero';
  if jsonb_typeof(x) <> 'object'
     or not public.profile_text_ok(x -> 'eyebrow', 120) or not public.profile_text_ok(x -> 'accent', 120)
     or not public.profile_text_ok(x -> 'headline', 120) or not public.profile_text_ok(x -> 'intro', 600) then
    return 'The introduction has a field that is too long or not allowed.';
  end if;
  if btrim(x ->> 'accent') = '' and btrim(x ->> 'headline') = '' then return 'Add a headline.'; end if;

  if jsonb_typeof(c -> 'highlights') <> 'array' or jsonb_array_length(c -> 'highlights') > 4
     or exists (select 1 from jsonb_array_elements(c -> 'highlights') h
                where jsonb_typeof(h) <> 'object'
                   or coalesce(h ->> 'icon', '') not in ('cap', 'case', 'award', 'chip', 'bolt', 'web', 'check')
                   or not public.profile_text_ok(h -> 'title', 120, true) or not public.profile_text_ok(h -> 'detail', 120)) then
    return 'Highlights: up to 4, each with a title of up to 120 characters.';
  end if;

  x := c -> 'about';
  if jsonb_typeof(x) <> 'object' or not public.profile_text_ok(x -> 'heading', 120) or not public.profile_list_ok(x -> 'paragraphs', 4, 1200) then
    return 'About: a heading and up to 4 paragraphs of up to 1200 characters.';
  end if;

  if jsonb_typeof(c -> 'timeline') <> 'array' or jsonb_array_length(c -> 'timeline') > 20
     or exists (select 1 from jsonb_array_elements(c -> 'timeline') e
                where jsonb_typeof(e) <> 'object'
                   or coalesce(e ->> 'kind', '') not in ('edu', 'work', 'award')
                   or not public.profile_text_ok(e -> 'title', 120, true)
                   or not public.profile_text_ok(e -> 'when', 120) or not public.profile_text_ok(e -> 'detail', 120)
                   or not public.profile_text_ok(e -> 'where', 120)
                   or not public.profile_list_ok(e -> 'tools', 12, 40)
                   or not public.profile_list_ok(e -> 'responsibilities', 8, 200)
                   or not public.profile_list_ok(e -> 'outcomes', 8, 200)) then
    return 'Experience and education: up to 20 entries, each with a title; details within their limits.';
  end if;

  if jsonb_typeof(c -> 'certificates') <> 'array' or jsonb_array_length(c -> 'certificates') > 12
     or exists (select 1 from jsonb_array_elements(c -> 'certificates') e
                where jsonb_typeof(e) <> 'object'
                   or not public.profile_text_ok(e -> 'name', 120, true)
                   or not public.profile_text_ok(e -> 'issuer', 120) or not public.profile_text_ok(e -> 'when', 120)
                   or not (e ->> 'href' = '' or public.profile_https_ok(e -> 'href'))) then
    return 'Certificates: up to 12, each with a name; links must start with https://.';
  end if;

  if not public.profile_list_ok(c -> 'focus', 6, 120) then return 'Current focus: up to 6 items of up to 120 characters.'; end if;

  if jsonb_typeof(c -> 'links') <> 'array' or jsonb_array_length(c -> 'links') > 8
     or exists (select 1 from jsonb_array_elements(c -> 'links') l
                where jsonb_typeof(l) <> 'object' or not public.profile_text_ok(l -> 'label', 40, true) or not public.profile_https_ok(l -> 'href')) then
    return 'Links: up to 8, each with a label and an https address.';
  end if;

  x := c -> 'contact';
  email := x -> 'email';
  if jsonb_typeof(x) <> 'object' or not public.profile_text_ok(x -> 'heading', 120) or not public.profile_text_ok(x -> 'text', 600)
     or jsonb_typeof(email) <> 'object' or jsonb_typeof(email -> 'user') <> 'string' or jsonb_typeof(email -> 'domain') <> 'string' then
    return 'The contact section has a field that is too long or not allowed.';
  end if;
  if not ((email ->> 'user' = '' and email ->> 'domain' = '')
          or ((email ->> 'user') ~ '^[A-Za-z0-9._%+-]{1,64}$' and (email ->> 'domain') ~ '^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
              and char_length(email ->> 'domain') <= 190)) then
    return 'The contact email address is not valid.';
  end if;
  return null;
end;
$$;

revoke all on function public.profile_text_ok(jsonb, integer, boolean) from public, anon, authenticated;
revoke all on function public.profile_list_ok(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.profile_https_ok(jsonb) from public, anon, authenticated;
revoke all on function public.profile_content_problem(jsonb) from public, anon, authenticated;

-- ---------- Private draft ----------

create table if not exists public.profile_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() unique,
  -- Incomplete drafts are allowed; the full check runs when publishing.
  content jsonb not null default '{}' check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);

alter table public.profile_drafts enable row level security;
revoke all on public.profile_drafts from anon;
grant select, insert, update, delete on public.profile_drafts to authenticated;
revoke truncate, references, trigger on public.profile_drafts from authenticated;
drop policy if exists "owner can read" on public.profile_drafts;
drop policy if exists "owner can add" on public.profile_drafts;
drop policy if exists "owner can edit" on public.profile_drafts;
drop policy if exists "owner can delete" on public.profile_drafts;
create policy "owner can read" on public.profile_drafts for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add" on public.profile_drafts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can edit" on public.profile_drafts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.profile_drafts for delete to authenticated using (user_id = (select auth.uid()));
-- Server-owned id, owner, timestamps and version, as vault_touch_row does for project records
-- (that function also pins project_id, which this table doesn't have).
create or replace function public.profile_drafts_touch()
returns trigger
language plpgsql
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
  return new;
end;
$$;
revoke all on function public.profile_drafts_touch() from public, anon, authenticated;

drop trigger if exists profile_drafts_touch on public.profile_drafts;
create trigger profile_drafts_touch before insert or update on public.profile_drafts
  for each row execute function public.profile_drafts_touch();

-- ---------- Published copy (public) ----------

create table if not exists public.profile_published (
  id boolean primary key default true check (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 100000),
  version integer not null check (version > 0),
  published_at timestamptz not null default now()
);

alter table public.profile_published enable row level security;
revoke all on public.profile_published from anon, authenticated;
-- Column list: visitors never see the owner id.
grant select (content, published_at) on public.profile_published to anon;
grant select (content, version, published_at) on public.profile_published to authenticated;
drop policy if exists "the published profile is public" on public.profile_published;
create policy "the published profile is public" on public.profile_published for select to anon, authenticated using (true);

-- ---------- History (private, append-only) ----------

create table if not exists public.profile_versions (
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 100000),
  published_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.profile_versions enable row level security;
revoke all on public.profile_versions from anon, authenticated;
grant select on public.profile_versions to authenticated;
drop policy if exists "owner can read" on public.profile_versions;
create policy "owner can read" on public.profile_versions for select to authenticated using (user_id = (select auth.uid()));

-- ---------- Publish ----------

-- Publishes the owner's saved draft, exactly the version the owner previewed and confirmed. Writes
-- a new history entry and replaces the public copy in one transaction. Returns the new version.
create or replace function public.publish_profile(p_draft_version integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  d public.profile_drafts;
  problem text;
  next_version integer;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.site_owner o where o.user_id = uid) then
    raise exception 'Only the site owner can publish the profile.' using errcode = '42501';
  end if;
  select * into d from public.profile_drafts where user_id = uid for update;
  if not found or d.version <> p_draft_version then
    raise exception 'The profile changed since you checked it. Review it again before publishing.' using errcode = '40001';
  end if;
  problem := public.profile_content_problem(d.content);
  if problem is not null then
    raise exception '%', problem using errcode = '23514';
  end if;

  select coalesce(max(v.version), 0) + 1 into next_version from public.profile_versions v where v.user_id = uid;
  insert into public.profile_versions (user_id, version, content, published_at) values (uid, next_version, d.content, now());
  insert into public.profile_published (id, user_id, content, version, published_at)
  values (true, uid, d.content, next_version, now())
  on conflict (id) do update
    set user_id = excluded.user_id, content = excluded.content, version = excluded.version, published_at = excluded.published_at;
  return next_version;
end;
$$;

revoke all on function public.publish_profile(integer) from public, anon;
grant execute on function public.publish_profile(integer) to authenticated;

commit;
