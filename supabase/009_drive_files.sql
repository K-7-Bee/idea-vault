-- Phase 3B: idea attachments stored in the owner's Google Drive.
-- Additive only: three columns and checks on idea_files. Existing rows become provider 'supabase'
-- and keep working unchanged. Safe to run more than once. Run 008_drive_connections.sql first.
--
-- A Drive row keeps path = 'drive/<drive file id>' so the existing not-null path, queries and
-- device recovery comparisons still hold. Bytes live in Drive; nothing here moves or deletes them.

begin;

alter table public.idea_files add column if not exists provider text not null default 'supabase';
alter table public.idea_files add column if not exists drive_file_id text;
alter table public.idea_files add column if not exists md5 text;

alter table public.idea_files drop constraint if exists idea_files_provider_check;
alter table public.idea_files add constraint idea_files_provider_check
  check (provider in ('supabase', 'drive'));

alter table public.idea_files drop constraint if exists idea_files_drive_ref_check;
alter table public.idea_files add constraint idea_files_drive_ref_check check (
  (provider = 'supabase' and drive_file_id is null and md5 is null)
  -- "is not null" matters: a check on a missing value is unknown, and CHECK lets unknown through.
  or (provider = 'drive'
      and drive_file_id is not null
      and drive_file_id ~ '^[A-Za-z0-9_-]{10,200}$'
      and path = 'drive/' || drive_file_id
      and (md5 is null or md5 ~ '^[0-9a-f]{32}$'))
);

-- One Drive file is linked to at most one attachment record.
create unique index if not exists idea_files_drive_file_key
  on public.idea_files (drive_file_id) where drive_file_id is not null;

commit;
