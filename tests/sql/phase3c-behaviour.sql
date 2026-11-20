\set ON_ERROR_STOP 1
-- Phase 3C: project_files and drive_folders (migration 011). Run as a superuser in a disposable
-- database after schema.sql, the idea_files table from 003, and 004-011.
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
delete from public.project_files; delete from public.drive_folders; delete from public.projects;

begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.projects (id, user_id, title, project_type) values
  ('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Robot arm', 'engineering'),
  ('b0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Second', 'engineering');
insert into public.project_entries (id, user_id, project_id, kind, title) values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'evidence', 'Stall test'),
  ('c0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000002', 'note', 'Other project entry');
insert into public.project_components (id, user_id, project_id, name) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'Servo');

-- files: upload attached to an entry, a picked Google Doc without size, server-owned timestamps
insert into public.project_files (id, user_id, project_id, entry_id, source, drive_file_id, name, mime_type, size, md5, created_at)
values ('e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'upload', 'drive-file-000001', 'scope.png', 'image/png', 10, 'd41d8cd98f00b204e9800998ecf8427e', '2000-01-01');
insert into public.project_files (id, user_id, project_id, source, drive_file_id, name, mime_type)
values ('e0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001',
        'picked', 'drive-gdoc-0000001', 'Design brief', 'application/vnd.google-apps.document');
select pg_temp.check((select created_at > '2020-01-01' and state = 'ok' from public.project_files where id = 'e0000000-0000-4000-8000-000000000001'), 'timestamps server-owned, state ok');
select pg_temp.check((select size is null from public.project_files where id = 'e0000000-0000-4000-8000-000000000002'), 'Google Doc without size');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','picked','drive-file-000001','dup')$q$, 'same Drive file twice in a project');
insert into public.project_files (user_id, project_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000002','picked','drive-file-000001','same file, other project');
select pg_temp.check((select count(*) = 3 from public.project_files), 'same Drive file may be linked to another project');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, entry_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','upload','drive-file-000009','x')$q$, 'entry from another project');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','copied','drive-file-000009','x')$q$, 'unknown source');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','picked','../x','x')$q$, 'malformed Drive ID');
select pg_temp.expect_error($q$update public.project_files set state='unavailable' where id='e0000000-0000-4000-8000-000000000002'$q$, 'unavailable without a reason');
select pg_temp.expect_error($q$update public.project_files set state_reason='missing' where id='e0000000-0000-4000-8000-000000000002'$q$, 'reason while ok');
update public.project_files set state = 'unavailable', state_reason = 'trashed', checked_at = now(), name = 'Design brief v2' where id = 'e0000000-0000-4000-8000-000000000002';
select pg_temp.check((select state = 'unavailable' and name = 'Design brief v2' from public.project_files where id = 'e0000000-0000-4000-8000-000000000002'), 'check result stored');
-- identity cannot be rewritten
update public.project_files set project_id = 'b0000000-0000-4000-8000-000000000002', drive_file_id = 'drive-other-00001', source = 'picked'
  where id = 'e0000000-0000-4000-8000-000000000001';
select pg_temp.check((select project_id = 'b0000000-0000-4000-8000-000000000001' and drive_file_id = 'drive-file-000001' and source = 'upload'
  from public.project_files where id = 'e0000000-0000-4000-8000-000000000001'), 'project, Drive file and source are fixed');
update public.project_files set entry_id = null, component_id = 'd0000000-0000-4000-8000-000000000001' where id = 'e0000000-0000-4000-8000-000000000001';
select pg_temp.check((select component_id is not null from public.project_files where id = 'e0000000-0000-4000-8000-000000000001'), 'reattached to a component');

-- folders
insert into public.drive_folders (user_id, purpose, parent_folder_id, folder_id) values ('11111111-1111-4111-8111-111111111111', 'projects_root', 'vault-root-000001', 'projects-folder-1');
insert into public.drive_folders (user_id, purpose, parent_folder_id, project_id, folder_id) values ('11111111-1111-4111-8111-111111111111', 'project', 'projects-folder-1', 'b0000000-0000-4000-8000-000000000001', 'project-folder-01');
select pg_temp.expect_error($q$insert into public.drive_folders (user_id, purpose, parent_folder_id, folder_id) values ('11111111-1111-4111-8111-111111111111','projects_root','vault-root-000001','projects-folder-2')$q$, 'second Projects folder under the same parent');
select pg_temp.expect_error($q$insert into public.drive_folders (user_id, purpose, parent_folder_id, project_id, folder_id) values ('11111111-1111-4111-8111-111111111111','project','projects-folder-1','b0000000-0000-4000-8000-000000000001','project-folder-02')$q$, 'second folder for the same project');
select pg_temp.expect_error($q$insert into public.drive_folders (user_id, purpose, parent_folder_id, folder_id) values ('11111111-1111-4111-8111-111111111111','project','projects-folder-1','project-folder-03')$q$, 'project folder without a project');
insert into public.drive_folders (user_id, purpose, parent_folder_id, folder_id) values ('11111111-1111-4111-8111-111111111111', 'projects_root', 'vault-root-000002', 'projects-folder-3');
select pg_temp.check((select count(*) = 3 from public.drive_folders), 'a new Vault folder gets its own Projects folder');
select pg_temp.expect_error($q$update public.drive_folders set folder_id = 'hijacked-folder-1'$q$, 'folder rows are not editable');
commit;

-- record deletes null the link; project deletes remove its file rows and folders
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.project_files set component_id = null, entry_id = 'c0000000-0000-4000-8000-000000000001' where id = 'e0000000-0000-4000-8000-000000000001';
delete from public.project_entries where id = 'c0000000-0000-4000-8000-000000000001';
select pg_temp.check((select entry_id is null from public.project_files where id = 'e0000000-0000-4000-8000-000000000001'), 'entry delete keeps the file, clears the link');
commit;

-- other users and anon see and change nothing
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.project_files) and (select count(*) = 0 from public.drive_folders), 'other user reads nothing');
update public.project_files set name = 'stolen';
delete from public.project_files;
delete from public.drive_folders;
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','picked','drive-file-000077','x')$q$, 'insert into the owner''s project');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, source, drive_file_id, name) values ('22222222-2222-4222-8222-222222222222','b0000000-0000-4000-8000-000000000001','picked','drive-file-000078','x')$q$, 'link own row to the owner''s project');
commit;
select pg_temp.check((select count(*) = 3 from public.project_files where name <> 'stolen') and (select count(*) = 3 from public.drive_folders), 'other user changed nothing');
begin; set local role anon;
select pg_temp.expect_error('select * from public.project_files', 'anon read files');
select pg_temp.expect_error('select * from public.drive_folders', 'anon read folders');
commit;
select pg_temp.check(not has_table_privilege('authenticated', 'public.project_files', 'TRUNCATE') and not has_table_privilege('authenticated', 'public.drive_folders', 'UPDATE'), 'no truncate; folders not updatable');

begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.projects where id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 1 from public.project_files) and (select count(*) = 2 from public.drive_folders), 'project delete removes its files and folder row');
commit;
