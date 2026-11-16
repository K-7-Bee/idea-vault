-- Phase 1B: idea titles, original capture, edit time and reversible archive.
-- Additive only: no column is dropped, renamed or rewritten, and existing rows keep
-- their id, content, status, tags and created_at. Safe to run more than once.
-- Run in Supabase > SQL Editor BEFORE deploying the app version that reads these columns.

alter table public.ideas
  add column if not exists title text,
  add column if not exists original_content text,
  add column if not exists updated_at timestamptz,
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ideas_title_length') then
    alter table public.ideas
      add constraint ideas_title_length check (title is null or char_length(title) between 1 and 200);
  end if;
end $$;

-- The database, not the browser, owns these values:
-- original_content is the text as first saved and never changes afterwards;
-- updated_at moves only when the idea itself (title/content/status/tags) changes;
-- archived_at is stamped with server time when archiving, and cleared on restore.
-- Existing rows keep original_content and updated_at empty rather than invented values.
create or replace function public.ideas_track_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.original_content := new.content;
    new.updated_at := null;
    new.archived_at := null;
    return new;
  end if;

  new.original_content := old.original_content;
  if (new.title, new.content, new.status, new.tags)
     is distinct from (old.title, old.content, old.status, old.tags) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  if new.archived_at is not null and old.archived_at is null then
    new.archived_at := now();
  elsif new.archived_at is not null then
    new.archived_at := old.archived_at;
  end if;
  return new;
end;
$$;

drop trigger if exists ideas_track_changes on public.ideas;
create trigger ideas_track_changes
  before insert or update on public.ideas
  for each row execute function public.ideas_track_changes();

-- The main list and counts read only active ideas.
create index if not exists ideas_user_active_created_idx
  on public.ideas (user_id, created_at desc, id desc) where archived_at is null;
create index if not exists ideas_user_archived_idx
  on public.ideas (user_id, archived_at desc) where archived_at is not null;

-- Row level security is unchanged: the existing owner-only policies cover the new columns.
