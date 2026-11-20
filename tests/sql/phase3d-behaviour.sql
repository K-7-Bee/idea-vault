\set ON_ERROR_STOP 1
-- Phase 3D: images on characters and structure items (migration 012). Run as a superuser in a
-- disposable database after schema.sql, the idea_files table from 003, and 004-012.
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
  ('b0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Saga', 'story'),
  ('b0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Other saga', 'story');
insert into public.story_characters (id, user_id, project_id, name) values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'Mira'),
  ('c0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000002', 'Other Mira');
insert into public.story_units (id, user_id, project_id, kind, title) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'shot', 'Opening shot');
insert into public.project_entries (id, user_id, project_id, kind, title) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'note', 'Note');

-- images on a character and a shot
insert into public.project_files (id, user_id, project_id, character_id, source, drive_file_id, name, mime_type, size) values
  ('e0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'upload', 'drive-portrait-001', 'mira.png', 'image/png', 10),
  ('e0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'picked', 'drive-portrait-002', 'mira-2.png', 'image/png', 10);
insert into public.project_files (id, user_id, project_id, unit_id, source, drive_file_id, name, mime_type, size, is_main) values
  ('e0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'upload', 'drive-frame-000001', 'frame.jpg', 'image/jpeg', 10, true);
select pg_temp.check((select count(*) = 3 from public.project_files), 'images on a character and a shot');
select pg_temp.check((select not is_main from public.project_files where id = 'e0000000-0000-4000-8000-000000000001'), 'main is off by default');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, character_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','picked','drive-file-x00001','x')$q$, 'character from another project');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, unit_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','picked','drive-file-x00002','x')$q$, 'unit from another project');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, character_id, unit_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','picked','drive-file-x00003','x')$q$, 'two records at once');
select pg_temp.expect_error($q$insert into public.project_files (user_id, project_id, entry_id, character_id, source, drive_file_id, name) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','picked','drive-file-x00004','x')$q$, 'entry and character at once');
insert into public.project_files (id, user_id, project_id, source, drive_file_id, name, is_main) values
  ('e0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 'picked', 'drive-loose-000001', 'loose.png', true);
select pg_temp.check((select not is_main from public.project_files where id = 'e0000000-0000-4000-8000-000000000004'), 'an unattached file is never main');

-- make main
select pg_temp.check(public.project_file_make_main('e0000000-0000-4000-8000-000000000001'), 'make main returns true');
select pg_temp.check((select is_main from public.project_files where id = 'e0000000-0000-4000-8000-000000000001'), 'first image is main');
select pg_temp.check(public.project_file_make_main('e0000000-0000-4000-8000-000000000002'), 'switch main');
select pg_temp.check((select count(*) = 1 and bool_and(id = 'e0000000-0000-4000-8000-000000000002') from public.project_files where character_id = 'c0000000-0000-4000-8000-000000000001' and is_main), 'exactly one main per character');
select pg_temp.check((select is_main from public.project_files where id = 'e0000000-0000-4000-8000-000000000003'), 'the shot keeps its own main');
select pg_temp.check(not public.project_file_make_main('e0000000-0000-4000-8000-000000000004'), 'an unattached file cannot be made main');
select pg_temp.expect_error($q$update public.project_files set is_main = true where id = 'e0000000-0000-4000-8000-000000000001'$q$, 'second main for the same character');
-- moving a file drops its main status
update public.project_files set character_id = null, unit_id = 'd0000000-0000-4000-8000-000000000001' where id = 'e0000000-0000-4000-8000-000000000002';
select pg_temp.check((select not is_main and unit_id is not null from public.project_files where id = 'e0000000-0000-4000-8000-000000000002'), 'moved file is no longer main');
select pg_temp.check(public.project_file_make_main('e0000000-0000-4000-8000-000000000002'), 'make the moved file main of the shot');
select pg_temp.check((select count(*) = 1 from public.project_files where unit_id = 'd0000000-0000-4000-8000-000000000001' and is_main), 'one main per shot after switching');
select pg_temp.check(public.project_file_make_main('e0000000-0000-4000-8000-000000000001'), 'character main again');
commit;

-- deleting the character keeps the file, clears the link and main status
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.story_characters where id = 'c0000000-0000-4000-8000-000000000001';
select pg_temp.check((select character_id is null and not is_main from public.project_files where id = 'e0000000-0000-4000-8000-000000000001'), 'character delete keeps the file, clears link and main');
commit;

-- other users and anon
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check(not public.project_file_make_main('e0000000-0000-4000-8000-000000000003'), 'other user cannot make the owner''s file main');
select pg_temp.check((select count(*) = 0 from public.project_files), 'other user reads nothing');
commit;
select pg_temp.check((select is_main from public.project_files where id = 'e0000000-0000-4000-8000-000000000002'), 'owner''s main unchanged by the other user');
begin; set local role anon;
select pg_temp.expect_error($q$select public.project_file_make_main('e0000000-0000-4000-8000-000000000003')$q$, 'anon cannot call make main');
commit;
select pg_temp.check(not has_function_privilege('anon', 'public.project_file_make_main(uuid)', 'EXECUTE'), 'anon has no execute on make main');

-- project delete removes everything
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.projects where id = 'b0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.project_files), 'project delete removes its images');
commit;
