\set ON_ERROR_STOP 1
-- Phase 3B: idea_files Drive columns (migration 009). Run as a superuser in a disposable database
-- after schema.sql, the idea_files table from 003 and 009.
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

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@fixture.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'other@fixture.invalid')
on conflict (id) do nothing;
delete from public.idea_files; delete from public.ideas;
insert into public.ideas (id, user_id, content) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner idea'),
  ('a0000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'other idea');

-- existing-style Supabase rows keep working and default to provider supabase
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.idea_files (id, idea_id, user_id, path, name, mime_type, size)
values ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111/a0000000-0000-4000-8000-000000000001/x-a.jpg', 'a.jpg', 'image/jpeg', 10);
select pg_temp.check((select provider = 'supabase' and drive_file_id is null and md5 is null from public.idea_files where id = 'f0000000-0000-4000-8000-000000000001'), 'legacy-style row defaults to supabase');
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, drive_file_id) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','p','n',1,'drive-file-000001')$q$, 'supabase row with a Drive ID');
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, md5) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','p','n',1,'d41d8cd98f00b204e9800998ecf8427e')$q$, 'supabase row with md5');
commit;

-- Drive rows need a valid ID, the matching path and a hex md5
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.idea_files (id, idea_id, user_id, path, name, mime_type, size, provider, drive_file_id, md5)
values ('f0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        'drive/drive-file-000001', 'clip.mp4', 'video/mp4', 1073741824, 'drive', 'drive-file-000001', 'd41d8cd98f00b204e9800998ecf8427e');
select pg_temp.check((select count(*) = 2 from public.idea_files), 'drive row stored (1 GB size fits bigint)');
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, provider) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','drive/x','n',1,'drive')$q$, 'drive row without ID');
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, provider, drive_file_id) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','drive/other-file-0001','n',1,'drive','drive-file-000009')$q$, 'drive path not matching ID');
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, provider, drive_file_id) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','drive/../../x','n',1,'drive','../../x')$q$, 'malformed Drive ID');
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, provider, drive_file_id, md5) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','drive/drive-file-000009','n',1,'drive','drive-file-000009','NOT-HEX')$q$, 'bad md5');
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, provider) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','p','n',1,'dropbox')$q$, 'unknown provider');
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, provider, drive_file_id) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','drive/drive-file-000001','dup',1,'drive','drive-file-000001')$q$, 'same Drive file linked twice');
commit;

-- owner-only rules are unchanged: another user and anon see nothing and can't link to the owner
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.idea_files), 'other user reads zero rows');
delete from public.idea_files;
select pg_temp.expect_error($q$insert into public.idea_files (idea_id, user_id, path, name, size, provider, drive_file_id) values ('a0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','drive/drive-file-000077','n',1,'drive','drive-file-000077')$q$, 'insert as another owner');
commit;
select pg_temp.check((select count(*) = 2 from public.idea_files), 'other user deleted nothing');
begin; set local role anon;
-- Before migration 010 anon reads zero rows (RLS); after 010 it has no privilege at all. The query
-- sits in PL/pgSQL so it is only planned (and permission-checked) when anon may run it.
do $$ begin
  if has_table_privilege('anon', 'public.idea_files', 'SELECT') then
    perform pg_temp.check((select count(*) = 0 from public.idea_files), 'anon reads no rows');
  else
    raise notice 'OK anon has no privilege on idea_files';
  end if;
end $$;
commit;

-- unlinking (deleting the record) works for the owner; nothing touches Drive from the database
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.idea_files where id = 'f0000000-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) = 1 from public.idea_files), 'owner unlinks Drive record');
commit;
