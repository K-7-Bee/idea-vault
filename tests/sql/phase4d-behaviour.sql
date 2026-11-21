\set ON_ERROR_STOP 1
-- Phase 4D: the Journal (migration 016). Run as a superuser in a disposable database after
-- schema.sql and 002-016, with the test-only Storage stand-in. Not live Supabase.
create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('role','authenticated',true), set_config('request.jwt.claims', json_build_object('sub',uid,'role','authenticated')::text, true), set_config('request.jwt.claim.sub', uid, true);
$$;
create or replace function pg_temp.as_anon() returns void language sql as $$
  select set_config('role','anon',true), set_config('request.jwt.claims', '{"role":"anon"}', true), set_config('request.jwt.claim.sub', '', true);
$$;
create or replace function pg_temp.expect_error(stmt text, label text, code text default null) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if code is not null and sqlstate <> code then raise exception 'FAIL % rejected with % (%), expected %', label, sqlstate, sqlerrm, code; end if;
    raise notice 'OK rejected: % (%)', label, sqlerrm; return;
  end;
  raise exception 'FAIL expected rejection: %', label;
end $$;
create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAIL %', label; end if; raise notice 'OK %', label; end $$;
grant execute on function pg_temp.as_user(text), pg_temp.as_anon(), pg_temp.expect_error(text,text,text), pg_temp.check(boolean,text) to public;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@fixture.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'other@fixture.invalid')
on conflict (id) do nothing;
delete from public.journal_published; delete from public.journal_entries;
delete from public.profile_drafts;
update public.library_files set public_path = null; delete from public.library_files;
delete from storage.objects where bucket_id in ('library', 'profile-files');
delete from public.showcases; delete from public.project_showcases;
delete from public.projects where user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
delete from public.site_owner;
insert into public.site_owner (user_id) values ('11111111-1111-4111-8111-111111111111');

-- A private project and a project with a live showcase (inserted directly, as the snapshot tables allow a superuser).
insert into public.projects (id, user_id, title, project_type, stage, publication_status) values
  ('dddddddd-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Secret robot arm', 'engineering', 'building', 'private'),
  ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Solar charger (private name)', 'engineering', 'completed', 'ready');
insert into public.showcases (project_id, user_id, slug, title, summary)
values ('dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'solar-charger', 'Solar charger', 'A charger.');
update public.projects set publication_status = 'published' where id = 'dddddddd-0000-4000-8000-000000000002';

-- ---------- Drafts ----------
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.journal_entries (id, user_id, slug, title, body, project_id) values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'first-note', 'First note', 'What I learned.', 'dddddddd-0000-4000-8000-000000000001'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'charger-lesson', 'Charger lesson', 'Fuses matter.', 'dddddddd-0000-4000-8000-000000000002'),
  ('eeeeeeee-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'fair-memory', 'Fair memory', 'The prize day.', null);
update public.journal_entries set case_study = 'waste-to-energy-lighting' where id = 'eeeeeeee-0000-4000-8000-000000000003';
select pg_temp.check((select version = 2 from public.journal_entries where id = 'eeeeeeee-0000-4000-8000-000000000003'), 'edits bump the version');
select pg_temp.expect_error($$insert into public.journal_entries (user_id, slug) values ('11111111-1111-4111-8111-111111111111', 'Bad Slug')$$, 'slug rules', '23514');
select pg_temp.expect_error($$insert into public.journal_entries (user_id, case_study) values ('11111111-1111-4111-8111-111111111111', 'not-a-case-study')$$, 'only the three case studies', '23514');
select pg_temp.expect_error($$update public.journal_entries set case_study = 'idea-vault' where id = 'eeeeeeee-0000-4000-8000-000000000001'$$, 'a project or a case study, not both', '23514');
select pg_temp.expect_error($$update public.journal_entries set images = '[{"file": "x", "alt": ""}]' where id = 'eeeeeeee-0000-4000-8000-000000000001'$$, 'images must be library ids', '23514');
select pg_temp.expect_error($$update public.journal_entries set images = (select jsonb_agg(jsonb_build_object('file', 'aaaaaaaa-0000-4000-8000-00000000000' || g, 'alt', 'x')) from generate_series(1, 5) g) where id = 'eeeeeeee-0000-4000-8000-000000000001'$$, 'at most 4 images', '23514');
commit;

begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.journal_entries), 'another account sees no drafts');
select pg_temp.expect_error($$insert into public.journal_entries (user_id, project_id) values ('22222222-2222-4222-8222-222222222222', 'dddddddd-0000-4000-8000-000000000001')$$, 'can''t link another account''s project', '23503');
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000001', 1)$$, 'another account can''t publish', '42501');
select pg_temp.expect_error($$select public.unpublish_journal_entry('eeeeeeee-0000-4000-8000-000000000001')$$, 'another account can''t unpublish', '42501');
commit;

begin; select pg_temp.as_anon();
select pg_temp.expect_error($$select count(*) from public.journal_entries$$, 'anon can''t read drafts', '42501');
select pg_temp.expect_error($$select count(*) from public.journal_published$$, 'anon can''t read the snapshot table', '42501');
select pg_temp.check((select count(*) = 0 from public.journal_public()), 'nothing is public before publishing');
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000001', 1)$$, 'anon can''t publish', '42501');
commit;

-- ---------- Publishing ----------
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000001', 9)$$, 'stale draft version', '40001');
select pg_temp.check((select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000001', 1) is not null), 'owner publishes an entry');
select pg_temp.check((select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000002', 1) is not null), 'and a second');
select pg_temp.check((select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000003', 2) is not null), 'and a third');
select pg_temp.check((select draft_version = 1 from public.journal_published where entry_id = 'eeeeeeee-0000-4000-8000-000000000001'), 'the snapshot remembers the published draft version');
update public.journal_entries set title = '<script>x</script>' where id = 'eeeeeeee-0000-4000-8000-000000000001';
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000001', 2)$$, 'HTML is refused', '23514');
update public.journal_entries set title = 'First note', body = '   ' where id = 'eeeeeeee-0000-4000-8000-000000000001';
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000001', 3)$$, 'an entry needs text', '23514');
select pg_temp.check((select body = 'What I learned.' from public.journal_public('first-note')), 'refused publishes leave the public copy unchanged');
update public.journal_entries set body = 'What I learned, revised.' where id = 'eeeeeeee-0000-4000-8000-000000000001';
select pg_temp.expect_error($$update public.journal_entries set slug = 'renamed-note' where id = 'eeeeeeee-0000-4000-8000-000000000001'$$, 'a published entry keeps its address', '23514');
insert into public.journal_entries (id, user_id, slug, title, body) values
  ('eeeeeeee-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'first-note', 'Same address', 'x');
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000004', 1)$$, 'two published entries can''t share an address', '23505');
select pg_temp.expect_error($$delete from public.journal_entries where id = 'eeeeeeee-0000-4000-8000-000000000001'$$, 'a published entry can''t be deleted', '23503');
select pg_temp.expect_error($$insert into public.journal_published (entry_id, user_id, slug, title, body, draft_version) values ('eeeeeeee-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'sneaky', 'x', 'x', 1)$$, 'nobody writes the snapshot directly', '42501');
commit;

-- ---------- Public read: project names only while public ----------
begin; select pg_temp.as_anon();
select pg_temp.check((select count(*) = 3 from public.journal_public()), 'anon reads the three published entries');
select pg_temp.check((select body = 'What I learned.' from public.journal_public('first-note')), 'anon sees the published text, not the newer draft');
select pg_temp.check((select project_slug is null and project_title is null from public.journal_public('first-note')), 'a private project is never named');
select pg_temp.check((select project_slug = 'solar-charger' and project_title = 'Solar charger' from public.journal_public('charger-lesson')), 'a public project is named by its public title');
select pg_temp.check((select project_slug = 'waste-to-energy-lighting' and project_title is null from public.journal_public('fair-memory')), 'a case study is linked by its slug');
select pg_temp.check((select position('Secret robot' in string_agg(r::text, '')) = 0 and position('private name' in string_agg(r::text, '')) = 0
  and position('dddddddd' in string_agg(r::text, '')) = 0 from public.journal_public() r), 'no private project title or id in any public row');
select pg_temp.check((select count(*) = 0 from public.journal_public('no-such-entry')), 'unknown address returns nothing');
commit;

-- The project leaves the public site: its name goes from the entry on the next read.
update public.projects set stage = 'building' where id = 'dddddddd-0000-4000-8000-000000000002';
begin; select pg_temp.as_anon();
select pg_temp.check((select project_slug is null and project_title is null from public.journal_public('charger-lesson')), 'unpublished project is no longer named');
select pg_temp.check((select count(*) = 3 from public.journal_public()), 'the entry itself stays published');
commit;

-- ---------- Unpublishing ----------
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check(public.unpublish_journal_entry('eeeeeeee-0000-4000-8000-000000000001'), 'owner unpublishes');
select pg_temp.check(not public.unpublish_journal_entry('eeeeeeee-0000-4000-8000-000000000001'), 'unpublishing twice reports nothing to do');
update public.journal_entries set slug = 'renamed-note' where id = 'eeeeeeee-0000-4000-8000-000000000001';
select pg_temp.check((select slug = 'renamed-note' from public.journal_entries where id = 'eeeeeeee-0000-4000-8000-000000000001'), 'an unpublished entry can change address');
delete from public.journal_entries where id = 'eeeeeeee-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 3 from public.journal_entries), 'an unpublished entry can be deleted');
select pg_temp.check((select count(*) = 2 from public.journal_published), 'owner reads which entries are published');
commit;
begin; select pg_temp.as_anon();
select pg_temp.check((select count(*) = 0 from public.journal_public('first-note')), 'unpublished entry is gone for visitors');
commit;

-- ---------- Images ----------
insert into public.library_files (id, user_id, path, kind, mime_type, bytes, sha256, name) values
  ('aaaaaaaa-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000011.jpg', 'image', 'image/jpeg', 100, repeat('1', 64), 'bench.jpg'),
  ('aaaaaaaa-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000012.pdf', 'pdf', 'application/pdf', 100, repeat('2', 64), 'cv.pdf');
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.journal_entries set images = '[{"file": "aaaaaaaa-0000-4000-8000-000000000011", "alt": ""}]' where id = 'eeeeeeee-0000-4000-8000-000000000003';
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000003', 3)$$, 'every image needs a description', '23514');
update public.journal_entries set images = '[{"file": "aaaaaaaa-0000-4000-8000-000000000011", "alt": "My bench"}]' where id = 'eeeeeeee-0000-4000-8000-000000000003';
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000003', 4)$$, 'refused without a public copy', '55000');
update public.library_files set public_path = 'cccccccc-0000-4000-8000-000000000011.jpg' where id = 'aaaaaaaa-0000-4000-8000-000000000011';
insert into storage.objects (bucket_id, name) values ('profile-files', 'cccccccc-0000-4000-8000-000000000011.jpg');
select pg_temp.check((select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000003', 4) is not null), 'publishes with the public copy');
select pg_temp.check((select images = '[{"file": "cccccccc-0000-4000-8000-000000000011.jpg", "alt": "My bench"}]' from public.journal_published where entry_id = 'eeeeeeee-0000-4000-8000-000000000003'), 'the snapshot holds only the copy''s name');
update public.journal_entries set images = '[{"file": "aaaaaaaa-0000-4000-8000-000000000012", "alt": "CV"}]' where id = 'eeeeeeee-0000-4000-8000-000000000003';
select pg_temp.expect_error($$select public.publish_journal_entry('eeeeeeee-0000-4000-8000-000000000003', 5)$$, 'a PDF can''t be a journal image', '55000');
update public.library_files set public_path = null where id = 'aaaaaaaa-0000-4000-8000-000000000011';
select pg_temp.expect_error($$delete from public.library_files where id = 'aaaaaaaa-0000-4000-8000-000000000012'$$, 'a file a journal draft uses can''t be deleted', '23503');
update public.journal_entries set images = '[]' where id = 'eeeeeeee-0000-4000-8000-000000000003';
delete from public.library_files where id = 'aaaaaaaa-0000-4000-8000-000000000012';
select pg_temp.check((select count(*) = 1 from public.library_files), 'once unused, it can be deleted');
commit;
begin; select pg_temp.as_anon();
select pg_temp.check((select images -> 0 ->> 'file' = 'cccccccc-0000-4000-8000-000000000011.jpg' from public.journal_public('fair-memory')), 'anon sees the public image copy');
commit;

-- ---------- Grants ----------
select pg_temp.check(not has_function_privilege('anon', 'public.publish_journal_entry(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.unpublish_journal_entry(uuid)', 'execute'), 'anon can''t publish or unpublish');
select pg_temp.check(has_function_privilege('anon', 'public.journal_public(text)', 'execute'), 'anon can call the public read');
select pg_temp.check(not has_column_privilege('authenticated', 'public.journal_published', 'project_id', 'select'), 'project ids stay inside the database');
select pg_temp.check(not has_function_privilege('authenticated', 'public.journal_text_ok(text, integer)', 'execute'), 'helpers are not callable');
-- Account deletion is not blocked by a published entry.
insert into public.journal_entries (id, user_id, slug, title, body) values
  ('eeeeeeee-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 'other-note', 'Other', 'x');
insert into public.journal_published (entry_id, user_id, slug, title, body, draft_version) values
  ('eeeeeeee-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 'other-note', 'Other', 'x', 1);
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
select pg_temp.check((select count(*) = 0 from public.journal_entries where user_id = '22222222-2222-4222-8222-222222222222'), 'account deletion removes its entries');
