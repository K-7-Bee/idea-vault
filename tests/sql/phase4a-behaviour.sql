\set ON_ERROR_STOP 1
-- Phase 4A: published project showcases (migration 013). Run as a superuser in a disposable database
-- after schema.sql and 002-013 (Storage tables must exist; a test-only stand-in is fine).
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
delete from storage.objects where bucket_id = 'showcase';
delete from public.project_files; delete from public.projects;

-- Owner: a completed project, a building one, and a draft for each.
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.projects (id, user_id, title, project_type, stage) values
  ('f0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Rover', 'engineering', 'completed'),
  ('f0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Half done', 'engineering', 'building');
insert into public.project_showcases (user_id, project_id, slug, title, summary, technologies, sections, links, images) values
  ('11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000001', 'line-rover', 'Line-following rover', 'A small rover.',
   '{Arduino,C++}', '{"lessons": "Tune the PID slowly.", "problem": "Follow a line.", "approach": "  "}',
   '[{"label": "Code", "href": "https://example.com/rover"}]', '[{"file_id": "x", "alt": "The rover on its track"}]'),
  ('11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000002', 'half-done', 'Half done', 'Not finished.', '{}', '{}', '[]', '[]');
select pg_temp.check((select count(*) = 2 from public.project_showcases), 'owner saves drafts');
select pg_temp.expect_error($$insert into public.projects (user_id, title, project_type, stage, publication_status) values ('11111111-1111-4111-8111-111111111111', 'Sneaky', 'engineering', 'completed', 'published')$$, 'project created as published');
select pg_temp.expect_error($$update public.projects set publication_status = 'published' where id = 'f0000000-0000-4000-8000-000000000001'$$, 'published set directly without a snapshot');
select pg_temp.expect_error($$update public.project_showcases set slug = 'cha-restaurant' where project_id = 'f0000000-0000-4000-8000-000000000001'$$, 'reserved slug in draft');
select pg_temp.expect_error($$update public.project_showcases set slug = 'Bad Slug' where project_id = 'f0000000-0000-4000-8000-000000000001'$$, 'malformed slug');
select pg_temp.expect_error($$insert into public.showcases (project_id, user_id, slug, title, summary) values ('f0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'direct', 'x', 'y')$$, 'owner writes snapshot directly');
commit;

-- Publishing rules.
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000002', 1, '{}')$$, 'publish a project that is not completed');
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 99, array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'])$$, 'stale draft version');
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 1, '{}')$$, 'image count differs from the draft');
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 1, array['22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'])$$, 'image path in another account folder');
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 1, array['11111111-1111-4111-8111-111111111111/../x.webp'])$$, 'image path traversal');
commit;
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.project_showcases set sections = '{"secret_notes": "private"}' where project_id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 2, array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'])$$, 'unknown section key');
rollback;
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.project_showcases set links = '[{"label": "Plain", "href": "http://example.com"}]' where project_id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 2, array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'])$$, 'non-https link');
rollback;
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.project_showcases set images = '[{"file_id": "x", "alt": " "}]' where project_id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 2, array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'])$$, 'image without a description');
rollback;
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 1, array['22222222-2222-4222-8222-222222222222/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'])$$, 'other account publishes the owner''s project');
select pg_temp.check((select count(*) = 0 from public.project_showcases), 'other account sees no drafts');
commit;

begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check(public.publish_showcase('f0000000-0000-4000-8000-000000000001', 1,
  array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp']) > 1, 'publish returns the new project version');
select pg_temp.check((select publication_status = 'published' from public.projects where id = 'f0000000-0000-4000-8000-000000000001'), 'project marked published');
select pg_temp.check((select sections = '[{"key": "problem", "body": "Follow a line."}, {"key": "lessons", "body": "Tune the PID slowly."}]'::jsonb
  from public.showcases where slug = 'line-rover'), 'snapshot keeps non-empty known sections in display order');
select pg_temp.check((select images = '[{"path": "11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp", "alt": "The rover on its track"}]'::jsonb
  from public.showcases where slug = 'line-rover'), 'snapshot images pair copied paths with descriptions');
-- Editing the draft afterwards does not change the public snapshot.
update public.project_showcases set title = 'Changed later' where project_id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check((select title = 'Line-following rover' from public.showcases where slug = 'line-rover'), 'draft edits stay private until republished');
-- Editing the project (still completed) keeps it published.
update public.projects set title = 'Rover v2' where id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 1 from public.showcases), 'unrelated project edit keeps the snapshot');
commit;

-- Anonymous visitors: the whitelisted columns of showcases, nothing else.
begin; select pg_temp.as_anon();
select pg_temp.check((select count(*) = 1 from public.showcases), 'anon reads the published snapshot');
select pg_temp.check((select title = 'Line-following rover' from public.showcases where slug = 'line-rover'), 'anon sees the published title');
select pg_temp.expect_error($$select user_id from public.showcases$$, 'anon reads the owner id');
select pg_temp.expect_error($$select project_id from public.showcases$$, 'anon reads the project id');
select pg_temp.expect_error($$select * from public.projects$$, 'anon reads projects');
select pg_temp.expect_error($$select * from public.project_showcases$$, 'anon reads drafts');
select pg_temp.expect_error($$select * from public.project_files$$, 'anon reads project files');
select pg_temp.expect_error($$select * from public.ideas$$, 'anon reads ideas');
select pg_temp.expect_error($$select * from public.drive_connections$$, 'anon reads Drive connections');
select pg_temp.expect_error($$insert into public.showcases (project_id, user_id, slug, title, summary) values (gen_random_uuid(), gen_random_uuid(), 'spam', 'x', 'y')$$, 'anon writes a snapshot');
select pg_temp.expect_error($$update public.showcases set title = 'defaced'$$, 'anon edits a snapshot');
select pg_temp.expect_error($$delete from public.showcases$$, 'anon deletes a snapshot');
select pg_temp.expect_error($$select public.publish_showcase('f0000000-0000-4000-8000-000000000001', 1, '{}')$$, 'anon calls publish');
select pg_temp.expect_error($$select public.unpublish_showcase('f0000000-0000-4000-8000-000000000001')$$, 'anon calls unpublish');
commit;
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.expect_error($$select public.unpublish_showcase('f0000000-0000-4000-8000-000000000001')$$, 'other account unpublishes');
select pg_temp.expect_error($$delete from public.showcases$$, 'other account deletes a snapshot');
commit;
select pg_temp.check((select count(*) = 1 from public.showcases), 'snapshot survives the refused attempts');

-- Every way out of "completed + published + active" removes the snapshot at once.
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.projects set stage = 'building' where id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.showcases), 'stage change away from completed removes the snapshot');
select pg_temp.check((select publication_status = 'ready' from public.projects where id = 'f0000000-0000-4000-8000-000000000001'), 'and sets the project back to ready');
update public.projects set stage = 'completed' where id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.showcases), 'completing again does not republish by itself');
commit;
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.publish_showcase('f0000000-0000-4000-8000-000000000001', (select version from public.project_showcases where project_id = 'f0000000-0000-4000-8000-000000000001'),
  array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp']);
select pg_temp.check((select title = 'Changed later' from public.showcases), 'republishing publishes the current draft');
update public.projects set archived_at = now() where id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.showcases), 'archiving removes the snapshot');
update public.projects set archived_at = null where id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check((select publication_status = 'ready' from public.projects where id = 'f0000000-0000-4000-8000-000000000001'), 'restoring does not republish');
commit;
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select public.publish_showcase('f0000000-0000-4000-8000-000000000001', (select version from public.project_showcases where project_id = 'f0000000-0000-4000-8000-000000000001'),
  array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp']);
update public.projects set publication_status = 'private' where id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.showcases), 'setting the project private removes the snapshot');
select public.publish_showcase('f0000000-0000-4000-8000-000000000001', (select version from public.project_showcases where project_id = 'f0000000-0000-4000-8000-000000000001'),
  array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp']);
select pg_temp.check(public.unpublish_showcase('f0000000-0000-4000-8000-000000000001') > 0, 'unpublish returns the project version');
select pg_temp.check((select count(*) = 0 from public.showcases), 'unpublish removes the snapshot');
select pg_temp.check((select publication_status = 'ready' from public.projects where id = 'f0000000-0000-4000-8000-000000000001'), 'unpublish leaves the project ready');
select public.publish_showcase('f0000000-0000-4000-8000-000000000001', (select version from public.project_showcases where project_id = 'f0000000-0000-4000-8000-000000000001'),
  array['11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp']);
-- A second completed project can't take a published address.
insert into public.projects (id, user_id, title, project_type, stage) values
  ('f0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Copycat', 'story', 'completed');
select pg_temp.expect_error($$insert into public.project_showcases (user_id, project_id, slug, title, summary) values ('11111111-1111-4111-8111-111111111111', 'f0000000-0000-4000-8000-000000000003', 'line-rover', 'x', 'y')$$, 'two drafts with one address');
delete from public.projects where id = 'f0000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.showcases), 'deleting the project removes the snapshot');
select pg_temp.check((select count(*) = 0 from public.project_showcases where project_id = 'f0000000-0000-4000-8000-000000000001'), 'and its draft');
commit;

-- Public image bucket: owner folder only; nobody else can list or add.
select pg_temp.check((select public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg','image/png','image/webp']
  from storage.buckets where id = 'showcase'), 'showcase bucket is public, 5 MB, images only');
select pg_temp.check((select not public from storage.buckets where id = 'attachments'), 'attachments bucket stays private');
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into storage.objects (bucket_id, name) values ('showcase', '11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp');
select pg_temp.check((select count(*) = 1 from storage.objects where bucket_id = 'showcase'), 'owner adds and lists own showcase images');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('showcase', '22222222-2222-4222-8222-222222222222/c.webp')$$, 'owner writes into another folder');
commit;
begin; select pg_temp.as_anon();
select pg_temp.check((select count(*) = 0 from storage.objects), 'anon cannot list any bucket');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('showcase', 'anon/x.webp')$$, 'anon uploads an image');
commit;
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from storage.objects where bucket_id = 'showcase'), 'other account cannot list the owner''s images');
delete from storage.objects where bucket_id = 'showcase';
commit;
select pg_temp.check((select count(*) = 1 from storage.objects where bucket_id = 'showcase'), 'other account cannot remove the owner''s images');
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from storage.objects where bucket_id = 'showcase';
select pg_temp.check((select count(*) = 0 from storage.objects where bucket_id = 'showcase'), 'owner removes own images');
commit;

\echo 'Phase 4A checks passed'
