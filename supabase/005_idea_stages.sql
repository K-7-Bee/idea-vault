-- Phase 2: idea stages become Exploring -> Analyzing -> Building -> Completed.
-- Owner decision (2026-11-17): migrate the stored values, not just the labels.
--
--   old value   new value
--   raw         exploring
--   exploring   analyzing
--   building    building
--   done        completed
--
-- Safe to run more than once: the rename only happens while the new constraint is absent,
-- so a second run cannot shift "exploring" again. Everything runs in one transaction, and
-- an unexpected status makes the whole migration roll back.
-- Run BEFORE deploying the app version that writes the new values.

begin;

do $$
declare
  legacy record;
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.ideas'::regclass and conname = 'ideas_stage_check'
  ) then
    raise notice 'Idea stages are already migrated; nothing changed.';
    return;
  end if;

  -- The original inline check from schema.sql: status in ('raw', 'exploring', 'building', 'done').
  for legacy in
    select conname from pg_constraint
    where conrelid = 'public.ideas'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.ideas drop constraint %I', legacy.conname);
  end loop;

  -- A rename is not a user edit: keep updated_at exactly as it was.
  alter table public.ideas disable trigger ideas_track_changes;
  update public.ideas
     set status = case status
                    when 'raw' then 'exploring'
                    when 'exploring' then 'analyzing'
                    when 'done' then 'completed'
                  end
   where status in ('raw', 'exploring', 'done');
  alter table public.ideas enable trigger ideas_track_changes;

  alter table public.ideas alter column status set default 'exploring';
  alter table public.ideas
    add constraint ideas_stage_check check (status in ('exploring', 'analyzing', 'building', 'completed'));
end $$;

-- Older app copies (open tabs, device recovery records) may still send 'raw' or 'done'.
-- Those two are unambiguous, so they are translated instead of rejected. A legacy 'exploring'
-- cannot be told apart from the new 'exploring' and is stored as the new value.
create or replace function public.ideas_legacy_stage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'raw' then
    new.status := 'exploring';
  elsif new.status = 'done' then
    new.status := 'completed';
  end if;
  return new;
end;
$$;

-- Named to sort before ideas_track_changes, so edit tracking sees the translated value.
drop trigger if exists ideas_legacy_stage on public.ideas;
create trigger ideas_legacy_stage
  before insert or update of status on public.ideas
  for each row execute function public.ideas_legacy_stage();

commit;
