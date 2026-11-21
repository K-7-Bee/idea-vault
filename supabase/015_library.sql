-- Phase 4C: a private files library, and a résumé and photo on the public profile.
-- Additive apart from replacing two 014 functions (profile_content_problem, publish_profile), which
-- keep their signatures, so the 4B app keeps working until the 4C app is deployed. Safe to run more
-- than once.
--
-- Privacy model:
--   * library_files and the private "library" bucket hold what the owner uploads, owner-only, in
--     the owner's folder. Nothing in it is public.
--   * At publish, the server copies each file the profile uses into the public "profile-files"
--     bucket under a random name with no folder (so no owner id in public addresses; images are
--     re-encoded without metadata first). Only the site owner can add or remove those copies.
--   * The draft refers to library files by id. publish_profile swaps each id for its public copy's
--     name, so the public row never holds a library id. History keeps the draft form, so "Restore to
--     draft" brings back the same library files.

begin;

-- ---------- Site owner check usable from Storage policies ----------

-- site_owner is closed to every API role (014); this answers only "is the caller the owner".
create or replace function public.is_site_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.site_owner o where o.user_id = (select auth.uid()));
$$;
revoke all on function public.is_site_owner() from public, anon;
grant execute on function public.is_site_owner() to authenticated;

-- ---------- Library (private) ----------

create table if not exists public.library_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- <owner id>/<random uuid>.<ext> in the private "library" bucket.
  path text not null unique check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  kind text not null check (kind in ('pdf', 'image')),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  bytes integer not null check (bytes > 0 and bytes <= 10485760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  name text not null check (char_length(name) between 1 and 200),
  -- <random uuid>.<ext> in the public "profile-files" bucket while the published profile uses it.
  public_path text unique check (public_path ~ '^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  created_at timestamptz not null default now(),
  unique (user_id, sha256),
  check (split_part(path, '/', 1) = user_id::text),
  check ((kind = 'pdf') = (mime_type = 'application/pdf'))
);

alter table public.library_files enable row level security;
revoke all on public.library_files from anon, authenticated;
grant select, insert, delete on public.library_files to authenticated;
-- Only the display name and the public copy's name change after upload.
grant update (name, public_path) on public.library_files to authenticated;
drop policy if exists "owner can read" on public.library_files;
drop policy if exists "owner can add" on public.library_files;
drop policy if exists "owner can edit" on public.library_files;
drop policy if exists "owner can delete" on public.library_files;
create policy "owner can read" on public.library_files for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add" on public.library_files for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can edit" on public.library_files for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.library_files for delete to authenticated using (user_id = (select auth.uid()));

-- New rows start private and timestamped by the server.
create or replace function public.library_files_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.public_path := null;
  return new;
end;
$$;
revoke all on function public.library_files_insert() from public, anon, authenticated;
drop trigger if exists library_files_insert on public.library_files;
create trigger library_files_insert before insert on public.library_files
  for each row execute function public.library_files_insert();

-- A file can't be deleted while the profile draft uses it or while it is on the public site.
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
    raise exception 'This file is on your public site. Remove it from the profile and publish first.' using errcode = '23503';
  end if;
  if exists (select 1 from public.profile_drafts d
             where d.user_id = old.user_id
               and (d.content #>> '{resume,file}' = old.id::text or d.content #>> '{photo,file}' = old.id::text)) then
    raise exception 'The profile draft uses this file. Remove it from the draft first.' using errcode = '23503';
  end if;
  return old;
end;
$$;
revoke all on function public.library_files_in_use() from public, anon, authenticated;
drop trigger if exists library_files_in_use on public.library_files;
create trigger library_files_in_use before delete on public.library_files
  for each row execute function public.library_files_in_use();

-- ---------- Buckets ----------

-- Private library: owner-only, in the owner's folder. PDF, JPEG, PNG or WebP, 10 MB at most.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner can read own library files" on storage.objects;
drop policy if exists "owner can add library files" on storage.objects;
drop policy if exists "owner can remove own library files" on storage.objects;
create policy "owner can read own library files" on storage.objects for select to authenticated
  using (bucket_id = 'library' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner can add library files" on storage.objects for insert to authenticated
  with check (bucket_id = 'library' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner can remove own library files" on storage.objects for delete to authenticated
  using (bucket_id = 'library' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Public copies: anyone can fetch one by its exact name; only the site owner can list, add or
-- remove them. Names are a random uuid and an extension, with no folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-files', 'profile-files', true, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "site owner can list profile files" on storage.objects;
drop policy if exists "site owner can add profile files" on storage.objects;
drop policy if exists "site owner can remove profile files" on storage.objects;
create policy "site owner can list profile files" on storage.objects for select to authenticated
  using (bucket_id = 'profile-files' and (select public.is_site_owner()));
create policy "site owner can add profile files" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-files' and (select public.is_site_owner()) and name ~ '^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$');
create policy "site owner can remove profile files" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-files' and (select public.is_site_owner()));

-- ---------- Content checks (014, plus résumé and photo) ----------

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
             where k not in ('name', 'hero', 'highlights', 'about', 'timeline', 'certificates', 'focus', 'links', 'contact', 'resume', 'photo')) then
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

  -- Optional (absent in 4B drafts). In the draft, file is a library file id or empty.
  if c ? 'resume' then
    x := c -> 'resume';
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'file') <> 'string' or jsonb_typeof(x -> 'name') <> 'string'
       or not (x ->> 'file' = ''
               or ((x ->> 'file') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   and (x ->> 'name') ~ '^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,95}\.pdf$')) then
      return 'Résumé: choose a PDF and give it a download name ending in .pdf (letters, numbers, spaces, dots, dashes, brackets).';
    end if;
  end if;
  if c ? 'photo' then
    x := c -> 'photo';
    if jsonb_typeof(x) <> 'object' or jsonb_typeof(x -> 'file') <> 'string' or not public.profile_text_ok(x -> 'alt', 200)
       or not (x ->> 'file' = ''
               or ((x ->> 'file') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   and public.profile_text_ok(x -> 'alt', 200, true))) then
      return 'Photo: choose an image and describe it (up to 200 characters).';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.profile_content_problem(jsonb) from public, anon, authenticated;

-- ---------- Publish (014, plus file substitution) ----------

-- As in 014, and: each library file the draft uses must already have a public copy (the publish
-- route makes it); the public row gets that copy's name instead of the library id. History keeps
-- the draft as it was.
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
  pub jsonb;
  part text;
  file_id text;
  public_name text;
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

  pub := d.content;
  foreach part in array array['resume', 'photo'] loop
    file_id := d.content #>> array[part, 'file'];
    if coalesce(file_id, '') <> '' then
      select l.public_path into public_name from public.library_files l
      where l.id = file_id::uuid and l.user_id = uid
        and l.kind = case part when 'resume' then 'pdf' else 'image' end;
      if public_name is null
         or not exists (select 1 from storage.objects o where o.bucket_id = 'profile-files' and o.name = public_name) then
        raise exception 'The % file is not ready to publish. Choose it again and retry.', case part when 'resume' then 'résumé' else 'photo' end
          using errcode = '55000';
      end if;
      pub := jsonb_set(pub, array[part, 'file'], to_jsonb(public_name));
    end if;
  end loop;

  select coalesce(max(v.version), 0) + 1 into next_version from public.profile_versions v where v.user_id = uid;
  insert into public.profile_versions (user_id, version, content, published_at) values (uid, next_version, d.content, now());
  insert into public.profile_published (id, user_id, content, version, published_at)
  values (true, uid, pub, next_version, now())
  on conflict (id) do update
    set user_id = excluded.user_id, content = excluded.content, version = excluded.version, published_at = excluded.published_at;
  return next_version;
end;
$$;

revoke all on function public.publish_profile(integer) from public, anon;
grant execute on function public.publish_profile(integer) to authenticated;

commit;
