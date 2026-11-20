-- Phase 4A: publishing completed projects to the public portfolio.
-- Additive: two new tables, two functions, publication rules on projects and a public image bucket.
-- Safe to run more than once. Run 006 (projects) first.
--
-- Privacy model:
--   * project_showcases holds the owner's private draft (owner-only, like every other Vault table).
--   * showcases holds the published snapshot: only whitelisted fields, copied from the draft when the
--     owner publishes. It is the ONLY table anonymous visitors can read, and only through a column
--     list (no owner id). Nobody can write it directly; publish_showcase/unpublish_showcase do.
--   * A project is public only while it is completed, published and not archived. Changing any of
--     those (in any tab, any device) deletes the snapshot in the same transaction.
--   * Images are copied into the public "showcase" bucket by the server at publish time. Drive
--     originals are never shared.

begin;

-- The three hand-written case studies on the site keep their addresses.
create or replace function public.showcase_slug_ok(slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60
     and slug not in ('waste-to-energy-lighting', 'cha-restaurant', 'idea-vault');
$$;

-- ---------- Private draft ----------

create table if not exists public.project_showcases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  slug text not null default '' check (slug = '' or public.showcase_slug_ok(slug)),
  title text not null default '' check (char_length(title) <= 120),
  category text not null default '' check (char_length(category) <= 60),
  summary text not null default '' check (char_length(summary) <= 400),
  technologies text[] not null default '{}' check (cardinality(technologies) <= 12),
  -- {"problem": "...", "approach": "...", ...}; keys are checked when publishing.
  sections jsonb not null default '{}' check (jsonb_typeof(sections) = 'object' and octet_length(sections::text) <= 60000),
  -- [{"label": "...", "href": "https://..."}]
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  -- [{"file_id": "<project_files.id>", "alt": "..."}]; the first is the cover.
  images jsonb not null default '[]' check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (project_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);
create unique index if not exists project_showcases_slug_key on public.project_showcases (slug) where slug <> '';

alter table public.project_showcases enable row level security;
revoke all on public.project_showcases from anon;
grant select, insert, update, delete on public.project_showcases to authenticated;
revoke truncate, references, trigger on public.project_showcases from authenticated;
drop policy if exists "owner can read" on public.project_showcases;
drop policy if exists "owner can add" on public.project_showcases;
drop policy if exists "owner can edit" on public.project_showcases;
drop policy if exists "owner can delete" on public.project_showcases;
create policy "owner can read" on public.project_showcases for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add" on public.project_showcases for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can edit" on public.project_showcases for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.project_showcases for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists vault_touch_row on public.project_showcases;
create trigger vault_touch_row before insert or update on public.project_showcases
  for each row execute function public.vault_touch_row('record');

-- ---------- Published snapshot (the only public table) ----------

create table if not exists public.showcases (
  project_id uuid primary key,
  user_id uuid not null,
  slug text not null unique check (public.showcase_slug_ok(slug)),
  title text not null check (char_length(title) between 1 and 120),
  category text not null default '' check (char_length(category) <= 60),
  summary text not null check (char_length(summary) between 1 and 400),
  technologies text[] not null default '{}' check (cardinality(technologies) <= 12),
  -- [{"key": "problem", "body": "..."}] in display order.
  sections jsonb not null default '[]' check (jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) <= 7),
  links jsonb not null default '[]' check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5),
  -- [{"path": "<owner id>/<random>.webp", "alt": "..."}] in the public "showcase" bucket.
  images jsonb not null default '[]' check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) <= 8),
  published_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

alter table public.showcases enable row level security;
revoke all on public.showcases from anon, authenticated;
-- Column list: visitors never see the owner id. Every row is published by construction.
grant select (slug, title, category, summary, technologies, sections, links, images, published_at) on public.showcases to anon;
grant select (project_id, slug, title, category, summary, technologies, sections, links, images, published_at) on public.showcases to authenticated;
drop policy if exists "published showcases are public" on public.showcases;
create policy "published showcases are public" on public.showcases for select to anon, authenticated using (true);

-- ---------- Publication rules on projects ----------

-- Before insert/update: a project can't be created as published, can only become published
-- through publish_showcase (which writes the snapshot first), and drops back to "ready" as soon as
-- it stops being completed or is archived.
create or replace function public.projects_publication_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.publication_status <> 'published' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'Publish a project from its Showcase tab.' using errcode = '23514';
  end if;
  if old.publication_status <> 'published'
     and not exists (select 1 from public.showcases s where s.project_id = new.id) then
    raise exception 'Publish a project from its Showcase tab.' using errcode = '23514';
  end if;
  if new.stage <> 'completed' or new.archived_at is not null then
    new.publication_status := 'ready';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_publication_rules on public.projects;
create trigger projects_publication_rules before insert or update on public.projects
  for each row execute function public.projects_publication_rules();

-- After update: anything that is no longer published loses its public snapshot in the same
-- transaction. Security definer because nobody else may write showcases; it only touches the
-- updated project's own row.
create or replace function public.projects_drop_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.publication_status <> 'published' then
    delete from public.showcases where project_id = new.id;
  end if;
  return null;
end;
$$;
revoke all on function public.projects_drop_snapshot() from public, anon, authenticated;

drop trigger if exists projects_drop_snapshot on public.projects;
create trigger projects_drop_snapshot after update of publication_status, stage, archived_at on public.projects
  for each row execute function public.projects_drop_snapshot();

-- ---------- Publish / unpublish ----------

-- Copies the owner's draft into the public snapshot and marks the project published, in one
-- transaction. The draft version must match what the owner previewed and confirmed. Image paths
-- come from the server route that copied the images; they must sit in the caller's own folder and
-- line up one-to-one with the draft's images. Returns the project's new version.
create or replace function public.publish_showcase(p_project uuid, p_draft_version integer, p_image_paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.projects;
  d public.project_showcases;
  sections jsonb;
  images jsonb;
  allowed text[] := array['problem', 'objective', 'approach', 'implementation', 'results', 'limitations', 'lessons'];
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project and user_id = uid for update;
  if not found then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;
  if p.stage <> 'completed' or p.archived_at is not null then
    raise exception 'Only a completed, active project can be published.' using errcode = '23514';
  end if;
  select * into d from public.project_showcases where project_id = p.id and user_id = uid;
  if not found or d.version <> p_draft_version then
    raise exception 'The showcase changed since you checked it. Review it again before publishing.' using errcode = '40001';
  end if;
  if d.slug = '' or btrim(d.title) = '' or btrim(d.summary) = '' then
    raise exception 'A showcase needs an address, a title and a summary.' using errcode = '23514';
  end if;

  -- Sections: only the known keys, non-empty, in a fixed order.
  if exists (select 1 from jsonb_each(d.sections) e
             where not (e.key = any (allowed)) or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 5000) then
    raise exception 'A section is not allowed or too long.' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'body', btrim(d.sections ->> k)) order by i), '[]'::jsonb)
    into sections
    from unnest(allowed) with ordinality as a(k, i)
   where btrim(coalesce(d.sections ->> k, '')) <> '';

  -- Links: https only, with a short label.
  if exists (select 1 from jsonb_array_elements(d.links) l
             where jsonb_typeof(l) <> 'object'
                or char_length(coalesce(l ->> 'label', '')) not between 1 and 80
                or coalesce(l ->> 'href', '') !~ '^https://[^[:space:]]+$'
                or char_length(l ->> 'href') > 2000) then
    raise exception 'Each link needs a label and an https address.' using errcode = '23514';
  end if;

  -- Images: one copied path per draft image, inside the caller's folder, each with alt text.
  if coalesce(cardinality(p_image_paths), 0) <> jsonb_array_length(d.images) then
    raise exception 'The images changed. Review the showcase again.' using errcode = '40001';
  end if;
  if exists (select 1 from unnest(p_image_paths) path
             where path !~ ('^' || uid::text || '/[0-9a-f-]{36}\.(webp|jpg|png)$')) then
    raise exception 'An image path is not allowed.' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_array_elements(d.images) img
             where jsonb_typeof(img) <> 'object' or char_length(btrim(coalesce(img ->> 'alt', ''))) not between 1 and 200) then
    raise exception 'Each image needs a short description.' using errcode = '23514';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('path', p_image_paths[i::int], 'alt', btrim(img ->> 'alt')) order by i), '[]'::jsonb)
    into images
    from jsonb_array_elements(d.images) with ordinality as x(img, i);

  insert into public.showcases (project_id, user_id, slug, title, category, summary, technologies, sections, links, images, published_at)
  values (p.id, uid, d.slug, btrim(d.title), btrim(d.category), btrim(d.summary), d.technologies, sections, d.links, images, now())
  on conflict (project_id) do update
    set slug = excluded.slug, title = excluded.title, category = excluded.category, summary = excluded.summary,
        technologies = excluded.technologies, sections = excluded.sections, links = excluded.links,
        images = excluded.images, published_at = excluded.published_at;

  update public.projects set publication_status = 'published' where id = p.id;
  return (select version from public.projects where id = p.id);
end;
$$;

-- Removes the public snapshot and sets the project back to "ready". Returns the project's version.
create or replace function public.unpublish_showcase(p_project uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  p public.projects;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  select * into p from public.projects where id = p_project and user_id = uid for update;
  if not found then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;
  delete from public.showcases where project_id = p.id;
  if p.publication_status = 'published' then
    update public.projects set publication_status = 'ready' where id = p.id;
  end if;
  return (select version from public.projects where id = p.id);
end;
$$;

revoke all on function public.publish_showcase(uuid, integer, text[]) from public, anon;
revoke all on function public.unpublish_showcase(uuid) from public, anon;
grant execute on function public.publish_showcase(uuid, integer, text[]) to authenticated;
grant execute on function public.unpublish_showcase(uuid) to authenticated;

-- ---------- Public image bucket ----------

-- Anyone can fetch an object by its exact path (that is what "public" means for a bucket), but
-- nobody can list the bucket except the owner, and only the owner can add or remove files, in
-- their own folder. Images are 5 MB at most, JPEG/PNG/WebP only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('showcase', 'showcase', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "owner can list own showcase images" on storage.objects;
drop policy if exists "owner can add showcase images" on storage.objects;
drop policy if exists "owner can remove own showcase images" on storage.objects;
create policy "owner can list own showcase images" on storage.objects for select to authenticated
  using (bucket_id = 'showcase' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner can add showcase images" on storage.objects for insert to authenticated
  with check (bucket_id = 'showcase' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner can remove own showcase images" on storage.objects for delete to authenticated
  using (bucket_id = 'showcase' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
