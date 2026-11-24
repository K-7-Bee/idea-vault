\set ON_ERROR_STOP 1
-- Phase 7A/7B: drawings (migration 018). Run as a superuser in a disposable database after
-- schema.sql and every migration. Creates its own accounts and rows, and removes its drawings at
-- the end so later suites can clear project_files freely.
create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('role','authenticated',true), set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true), set_config('request.jwt.claim.sub', uid, true);
$$;
create or replace function pg_temp.as_anon() returns void language sql as $$
  select set_config('role','anon',true), set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
$$;
create or replace function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'OK rejected: % (%)', label, sqlerrm; return; end;
  raise exception 'FAIL expected rejection: %', label;
end $$;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAIL %', label; end if; raise notice 'OK %', label; end $$;
grant execute on function pg_temp.as_user(text), pg_temp.as_anon(), pg_temp.expect_error(text,text), pg_temp.check(boolean,text) to public;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@fixture.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'other@fixture.invalid')
on conflict (id) do nothing;

-- Owner: two story projects; project 1 has a scene, a shot inside it and an episode; an image file.
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.projects (id, user_id, title, project_type) values
  ('d7000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Storyboard', 'story'),
  ('d7000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Other story', 'story');
insert into public.story_units (id, user_id, project_id, kind, title) values
  ('d7100000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000001', 'episode', 'Pilot'),
  ('d7100000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000001', 'scene', 'Rooftop'),
  ('d7100000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000002', 'shot', 'Elsewhere');
insert into public.story_units (id, user_id, project_id, parent_id, kind, title) values
  ('d7100000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000001', 'd7100000-0000-4000-8000-000000000002', 'shot', 'Wide');
insert into public.project_files (id, user_id, project_id, source, drive_file_id, name, mime_type, size) values
  ('d7200000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000001', 'picked', 'drive-file-d70001', 'ref.png', 'image/png', 10),
  ('d7200000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000002', 'picked', 'drive-file-d70002', 'other.png', 'image/png', 10);

insert into public.drawings (id, user_id, project_id, unit_id, title, data) values
  ('d7300000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000001',
   'd7100000-0000-4000-8000-000000000003', 'Wide, first pass', '{"v":1,"items":[{"t":"pen","c":"#1f2937","s":4,"p":[10,10,500,20,20,500]}]}');
insert into public.drawings (id, user_id, project_id, unit_id, title) values
  ('d7300000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000001',
   'd7100000-0000-4000-8000-000000000002', 'Scene mood');
insert into public.drawings (id, user_id, project_id, base_file_id, aspect) values
  ('d7300000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'd7000000-0000-4000-8000-000000000001',
   'd7200000-0000-4000-8000-000000000001', 'image');
select pg_temp.check((select count(*) = 3 from public.drawings), 'owner adds sketches to a shot and a scene, and an annotation layer to an image');
select pg_temp.check((select version = 1 and data->'items'->0->>'t' = 'pen' from public.drawings where id = 'd7300000-0000-4000-8000-000000000001'), 'data stored as sent, version 1');

select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000001')$q$, 'sketch on an episode');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000004')$q$, 'shot from another project');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, base_file_id, aspect) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000002','image')$q$, 'image from another project');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, base_file_id, aspect) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7200000-0000-4000-8000-000000000001','image')$q$, 'second annotation layer on the same image');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001')$q$, 'drawing linked to nothing');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id, base_file_id, aspect) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003','d7200000-0000-4000-8000-000000000001','image')$q$, 'drawing linked to two things');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id, aspect) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003','image')$q$, 'sketch claiming the image shape');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id, aspect) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003','2:1')$q$, 'unknown shape');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id, data) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003','{"v":2,"items":[]}')$q$, 'unknown data format');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id, data) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003','[]')$q$, 'data that is not an object');
-- About 3 MB of incompressible text: over the 2 MB limit even after TOAST compression.
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id, data) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003',
  jsonb_build_object('v',1,'items',jsonb_build_array(jsonb_build_object('t','label','x',(select string_agg(md5(g::text), '') from generate_series(1, 100000) g)))))$q$, 'data over 2 MB');

-- Updates: version goes up; the link and the annotation shape can't be changed; ids and owners are kept.
update public.drawings set data = '{"v":1,"items":[]}', title = 'Wide, cleared' where id = 'd7300000-0000-4000-8000-000000000001' and version = 1;
select pg_temp.check((select version = 2 and title = 'Wide, cleared' from public.drawings where id = 'd7300000-0000-4000-8000-000000000001'), 'saving increases the version');
with u as (update public.drawings set title = 'stale' where id = 'd7300000-0000-4000-8000-000000000001' and version = 1 returning 1)
select pg_temp.check((select count(*) = 0 from u), 'a save naming an old version changes nothing');
update public.drawings set unit_id = 'd7100000-0000-4000-8000-000000000002', aspect = '1:1' where id = 'd7300000-0000-4000-8000-000000000001';
select pg_temp.check((select unit_id = 'd7100000-0000-4000-8000-000000000003' and aspect = '1:1' from public.drawings where id = 'd7300000-0000-4000-8000-000000000001'), 'a sketch keeps its shot (shape may change)');
update public.drawings set aspect = '16:9' where id = 'd7300000-0000-4000-8000-000000000003';
select pg_temp.check((select aspect = 'image' and base_file_id = 'd7200000-0000-4000-8000-000000000001' from public.drawings where id = 'd7300000-0000-4000-8000-000000000003'), 'an annotation keeps its image and shape');
update public.drawings set project_id = 'd7000000-0000-4000-8000-000000000002' where id = 'd7300000-0000-4000-8000-000000000002';
select pg_temp.check((select project_id = 'd7000000-0000-4000-8000-000000000001' from public.drawings where id = 'd7300000-0000-4000-8000-000000000002'), 'a drawing never moves to another project');

-- Nothing disappears by cascade: the shot and the image can't be removed while drawings use them.
select pg_temp.expect_error($q$delete from public.story_units where id = 'd7100000-0000-4000-8000-000000000003'$q$, 'deleting a shot that has a sketch');
select pg_temp.expect_error($q$delete from public.project_files where id = 'd7200000-0000-4000-8000-000000000001'$q$, 'removing an image that has annotations');
commit;

-- Another account sees and changes nothing.
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.drawings), 'another account sees no drawings');
with u as (update public.drawings set title = 'mine now' returning 1) select pg_temp.check((select count(*) = 0 from u), 'another account updates nothing');
with d as (delete from public.drawings returning 1) select pg_temp.check((select count(*) = 0 from d), 'another account deletes nothing');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id) values ('22222222-2222-4222-8222-222222222222','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003')$q$, 'another account adds to the owner''s shot');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003')$q$, 'another account writes as the owner');
commit;

-- Visitors have no access at all.
begin; select pg_temp.as_anon();
select pg_temp.expect_error($q$select count(*) from public.drawings$q$, 'anon reads drawings');
select pg_temp.expect_error($q$insert into public.drawings (user_id, project_id, unit_id) values ('11111111-1111-4111-8111-111111111111','d7000000-0000-4000-8000-000000000001','d7100000-0000-4000-8000-000000000003')$q$, 'anon adds a drawing');
commit;
select pg_temp.check((select not has_table_privilege('anon', 'public.drawings', 'select,insert,update,delete')), 'anon has no privileges on drawings');
select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.drawings'::regclass), 'row level security is on');

-- Owner: deleting the drawings frees the shot; deleting a whole project removes its drawings too.
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.drawings where id = 'd7300000-0000-4000-8000-000000000001';
delete from public.story_units where id = 'd7100000-0000-4000-8000-000000000003';
select pg_temp.check((select count(*) = 0 from public.story_units where id = 'd7100000-0000-4000-8000-000000000003'), 'a shot can be deleted once its sketches are');
delete from public.projects where id = 'd7000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.drawings where project_id = 'd7000000-0000-4000-8000-000000000001'), 'deleting the project removes its drawings, shots and images together');
delete from public.projects where id = 'd7000000-0000-4000-8000-000000000002';
commit;
