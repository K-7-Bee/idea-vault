\set ON_ERROR_STOP 1
-- Migration 010: privileges after tightening. Run as a superuser in a disposable database after
-- schema.sql, the idea_files table from 003, 004-009 and 010.
create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('role','authenticated',true), set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true), set_config('request.jwt.claim.sub', uid, true);
$$;
create or replace function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'OK rejected: % (%)', label, sqlerrm; return; end;
  raise exception 'FAIL expected rejection: %', label;
end $$;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAIL %', label; end if; raise notice 'OK %', label; end $$;
grant execute on function pg_temp.as_user(text), pg_temp.expect_error(text,text), pg_temp.check(boolean,text) to public;

-- privilege catalogue
select pg_temp.check(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
  where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('anon', c.oid, p)), 'anon has no privilege on any public table');
select pg_temp.check(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER']) p
  where n.nspname = 'public' and c.relkind = 'r' and has_table_privilege('authenticated', c.oid, p)), 'authenticated has no TRUNCATE/REFERENCES/TRIGGER');
select pg_temp.check((select bool_and(has_table_privilege('authenticated', format('public.%I', t), p))
  from unnest(array['ideas','idea_files','drive_connections','projects']) t cross join unnest(array['SELECT','INSERT','DELETE']) p), 'authenticated keeps select/insert/delete');
select pg_temp.check(has_table_privilege('authenticated', 'public.ideas', 'UPDATE'), 'authenticated keeps update on ideas');

insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'owner@fixture.invalid') on conflict (id) do nothing;
delete from public.idea_files; delete from public.ideas;

-- the owner's normal work is unchanged
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.ideas (id, user_id, content) values ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'still works');
update public.ideas set content = 'edited' where id = 'a0000000-0000-4000-8000-000000000001';
insert into public.idea_files (idea_id, user_id, path, name, size, provider, drive_file_id)
  values ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'drive/drive-file-000001', 'a', 1, 'drive', 'drive-file-000001');
select pg_temp.check((select count(*) = 1 from public.idea_files), 'owner adds an attachment');
select pg_temp.expect_error('truncate public.idea_files', 'owner truncate');
select pg_temp.expect_error('truncate public.ideas', 'owner truncate ideas');
delete from public.idea_files;
delete from public.ideas;
select pg_temp.check((select count(*) = 0 from public.ideas), 'owner edits and deletes');
commit;

-- anonymous access fails outright instead of returning no rows
begin; set local role anon;
select pg_temp.expect_error('select * from public.ideas', 'anon read ideas');
select pg_temp.expect_error('select * from public.idea_files', 'anon read idea_files');
select pg_temp.expect_error($q$insert into public.ideas (content) values ('x')$q$, 'anon insert');
commit;
