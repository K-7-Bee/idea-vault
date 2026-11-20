-- Hardening: remove table privileges nothing in the Vault uses.
-- No row, column, policy or function changes. Safe to run more than once.
--
-- 1. Anonymous visitors: ideas, idea_files and timevault_state still carried Supabase's default
--    grants. Every policy on them is "to authenticated", so anon already saw no rows; this makes
--    the denial explicit at the privilege level too (later tables were created without anon grants).
-- 2. Logged-in users: TRUNCATE, REFERENCES and TRIGGER are not used by the app or reachable through
--    the Supabase API, and TRUNCATE is not subject to row level security. SELECT, INSERT, UPDATE and
--    DELETE (governed by the owner policies) are unchanged.
--
-- Not covered: Supabase's default privileges for tables created later. New migrations keep
-- revoking anon explicitly, as 006-008 do.

begin;

do $$
declare
  t text;
begin
  foreach t in array array['ideas', 'idea_files', 'timevault_state'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon', t);
    end if;
  end loop;
end $$;

revoke truncate, references, trigger on all tables in schema public from authenticated;

commit;
