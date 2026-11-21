\set ON_ERROR_STOP 1
-- Phase 4C: the files library and the résumé and photo on the profile (migration 015). Run as a
-- superuser in a disposable database after schema.sql and 002-015, with a test-only stand-in for
-- the Storage tables. Not live Supabase or real Supabase Storage.
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
create or replace function pg_temp.good() returns jsonb language sql as $$ select '{
  "name": "Ada Example",
  "hero": {"eyebrow": "", "accent": "Curiosity meets", "headline": "engineering.", "intro": ""},
  "highlights": [], "about": {"heading": "", "paragraphs": []}, "timeline": [], "certificates": [], "focus": [], "links": [],
  "contact": {"heading": "", "text": "", "email": {"user": "", "domain": ""}}
}'::jsonb $$;
-- good() plus a résumé and photo pointing at the fixed library ids below.
create or replace function pg_temp.with_files() returns jsonb language sql as $$
  select pg_temp.good()
    || '{"resume": {"file": "aaaaaaaa-0000-4000-8000-000000000001", "name": "Ada-Example-Resume.pdf"},
         "photo": {"file": "aaaaaaaa-0000-4000-8000-000000000002", "alt": "Ada at a workbench"}}'::jsonb $$;
grant execute on function pg_temp.as_user(text), pg_temp.as_anon(), pg_temp.expect_error(text,text,text), pg_temp.check(boolean,text),
  pg_temp.good(), pg_temp.with_files() to public;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@fixture.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'other@fixture.invalid')
on conflict (id) do nothing;
delete from public.profile_published; delete from public.profile_versions; delete from public.profile_drafts;
update public.library_files set public_path = null; delete from public.library_files;
delete from storage.objects where bucket_id in ('library', 'profile-files');
delete from public.site_owner;
insert into public.site_owner (user_id) values ('11111111-1111-4111-8111-111111111111');

select pg_temp.check((select public from storage.buckets where id = 'library') = false, 'the library bucket is private');
select pg_temp.check((select public from storage.buckets where id = 'profile-files') = true, 'the profile-files bucket is public');
select pg_temp.check((select file_size_limit = 10485760 and allowed_mime_types @> array['application/pdf','image/jpeg','image/png','image/webp']
  and cardinality(allowed_mime_types) = 4 from storage.buckets where id = 'library'), 'library: 10 MB, PDF/JPEG/PNG/WebP only');

-- ---------- Library rows ----------
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.library_files (id, user_id, path, kind, mime_type, bytes, sha256, name, public_path) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000001.pdf', 'pdf', 'application/pdf', 1000, repeat('a', 64), 'Resume.pdf',
   'cccccccc-0000-4000-8000-000000000009.pdf'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000002.jpg', 'image', 'image/jpeg', 2000, repeat('b', 64), 'Me.jpg', null);
select pg_temp.check((select count(*) = 2 and bool_and(public_path is null) from public.library_files), 'owner adds files; a new file is never pre-marked public');
select pg_temp.expect_error($$insert into public.library_files (user_id, path, kind, mime_type, bytes, sha256, name) values ('11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-000000000003.pdf', 'pdf', 'application/pdf', 5, repeat('c', 64), 'x')$$, 'path in another account''s folder', '23514');
select pg_temp.expect_error($$insert into public.library_files (user_id, path, kind, mime_type, bytes, sha256, name) values ('11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000004.pdf', 'pdf', 'application/pdf', 5, repeat('a', 64), 'again')$$, 'the same file twice (same hash)', '23505');
select pg_temp.expect_error($$insert into public.library_files (user_id, path, kind, mime_type, bytes, sha256, name) values ('11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000005.pdf', 'image', 'application/pdf', 5, repeat('d', 64), 'x')$$, 'kind must match the type', '23514');
select pg_temp.expect_error($$insert into public.library_files (user_id, path, kind, mime_type, bytes, sha256, name) values ('11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000006.exe', 'pdf', 'application/pdf', 5, repeat('e', 64), 'x')$$, 'only pdf/jpg/png/webp paths', '23514');
select pg_temp.expect_error($$insert into public.library_files (user_id, path, kind, mime_type, bytes, sha256, name) values ('11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000007.pdf', 'pdf', 'application/pdf', 10485761, repeat('f', 64), 'x')$$, 'over 10 MB', '23514');
select pg_temp.expect_error($$update public.library_files set sha256 = repeat('9', 64)$$, 'hash cannot be changed', '42501');
select pg_temp.expect_error($$update public.library_files set path = '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000008.pdf'$$, 'path cannot be changed', '42501');
update public.library_files set name = 'My résumé.pdf' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.check((select name = 'My résumé.pdf' from public.library_files where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'owner renames a file');
commit;

begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.library_files), 'another account sees none of the owner''s files');
delete from public.library_files;
update public.library_files set public_path = 'cccccccc-0000-4000-8000-000000000001.pdf';
commit;
select pg_temp.check((select count(*) = 2 and bool_and(public_path is null) from public.library_files), 'another account can''t delete or mark the owner''s files');

begin; select pg_temp.as_anon();
select pg_temp.expect_error($$select count(*) from public.library_files$$, 'anon can''t read the library table', '42501');
select pg_temp.expect_error($$select public.is_site_owner()$$, 'anon can''t call is_site_owner', '42501');
commit;

-- ---------- Storage policies ----------
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check(public.is_site_owner(), 'the owner is the site owner');
insert into storage.objects (bucket_id, name) values ('library', '11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000001.pdf');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('library', '22222222-2222-4222-8222-222222222222/x.pdf')$$, 'owner can''t write into another library folder', '42501');
insert into storage.objects (bucket_id, name) values ('profile-files', 'cccccccc-0000-4000-8000-000000000001.pdf');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('profile-files', '11111111-1111-4111-8111-111111111111/cccccccc-0000-4000-8000-000000000002.pdf')$$, 'public copies have no folder (no owner id in the address)', '42501');
select pg_temp.check((select count(*) = 1 from storage.objects where bucket_id = 'profile-files'), 'site owner lists the public copies');
commit;

begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check(not public.is_site_owner(), 'another account is not the site owner');
select pg_temp.check((select count(*) = 0 from storage.objects where bucket_id in ('library', 'profile-files')), 'another account can''t list the library or the public copies');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('profile-files', 'cccccccc-0000-4000-8000-000000000003.pdf')$$, 'only the site owner adds public copies', '42501');
delete from storage.objects where bucket_id in ('library', 'profile-files');
commit;
select pg_temp.check((select count(*) = 2 from storage.objects where bucket_id in ('library', 'profile-files')), 'another account can''t remove library files or public copies');

begin; select pg_temp.as_anon();
select pg_temp.check((select count(*) = 0 from storage.objects where bucket_id in ('library', 'profile-files')), 'anon can''t list the library or the public copies');
commit;

-- ---------- Content checks ----------
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.profile_drafts (user_id, content) values ('11111111-1111-4111-8111-111111111111', pg_temp.good());
select pg_temp.check((select public.publish_profile(1) = 1), 'a 4B-shaped draft (no résumé or photo) still publishes');
select pg_temp.check((select content = pg_temp.good() from public.profile_published), 'and is published unchanged');
update public.profile_drafts set content = jsonb_set(pg_temp.with_files(), '{resume,name}', '"résumé.exe"');
select pg_temp.expect_error($$select public.publish_profile(2)$$, 'résumé download name must be a plain .pdf name', '23514');
update public.profile_drafts set content = jsonb_set(pg_temp.with_files(), '{photo,alt}', '""');
select pg_temp.expect_error($$select public.publish_profile(3)$$, 'a photo needs a description', '23514');
update public.profile_drafts set content = jsonb_set(pg_temp.with_files(), '{photo,file}', '"../../etc/passwd"');
select pg_temp.expect_error($$select public.publish_profile(4)$$, 'file must be a library id', '23514');
update public.profile_drafts set content = jsonb_set(pg_temp.with_files(), '{photo,alt}', '"<img src=x>"');
select pg_temp.expect_error($$select public.publish_profile(5)$$, 'no HTML in the photo description', '23514');
update public.profile_drafts set content = pg_temp.with_files() || '{"journal": []}';
select pg_temp.expect_error($$select public.publish_profile(6)$$, 'unknown sections still refused', '23514');

-- ---------- Publishing files ----------
update public.profile_drafts set content = pg_temp.with_files();
select pg_temp.expect_error($$select public.publish_profile(7)$$, 'refused while the files have no public copy', '55000');
select pg_temp.check((select version = 1 from public.profile_published), 'nothing changed on the public site');
update public.library_files set public_path = 'cccccccc-0000-4000-8000-000000000001.pdf' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.library_files set public_path = 'cccccccc-0000-4000-8000-000000000002.jpg' where id = 'aaaaaaaa-0000-4000-8000-000000000002';
select pg_temp.expect_error($$select public.publish_profile(7)$$, 'refused while a recorded public copy is missing from storage', '55000');
insert into storage.objects (bucket_id, name) values ('profile-files', 'cccccccc-0000-4000-8000-000000000002.jpg');
select pg_temp.check((select public.publish_profile(7) = 2), 'publishes once both public copies exist');
select pg_temp.check((select content #>> '{resume,file}' = 'cccccccc-0000-4000-8000-000000000001.pdf'
  and content #>> '{photo,file}' = 'cccccccc-0000-4000-8000-000000000002.jpg'
  and content #>> '{resume,name}' = 'Ada-Example-Resume.pdf' from public.profile_published), 'the public row names the public copies');
select pg_temp.check((select position('aaaaaaaa-0000' in content::text) = 0 from public.profile_published), 'no library id reaches the public row');
select pg_temp.check((select content = pg_temp.with_files() from public.profile_versions where version = 2), 'history keeps the draft form (library ids) for restore');
commit;

begin; select pg_temp.as_anon();
select pg_temp.check((select content #>> '{resume,file}' = 'cccccccc-0000-4000-8000-000000000001.pdf' from public.profile_published), 'anon reads the published résumé copy name');
commit;

-- Wrong kind, and another account's file.
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.profile_drafts set content = jsonb_set(pg_temp.with_files(), '{resume,file}', '"aaaaaaaa-0000-4000-8000-000000000002"');
select pg_temp.expect_error($$select public.publish_profile(8)$$, 'an image can''t be the résumé', '55000');
commit;
insert into public.library_files (id, user_id, path, kind, mime_type, bytes, sha256, name) values
  ('aaaaaaaa-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   '22222222-2222-4222-8222-222222222222/bbbbbbbb-0000-4000-8000-000000000009.pdf', 'pdf', 'application/pdf', 10, repeat('9', 64), 'Theirs.pdf');
update public.library_files set public_path = 'cccccccc-0000-4000-8000-000000000003.pdf' where id = 'aaaaaaaa-0000-4000-8000-000000000003';
insert into storage.objects (bucket_id, name) values ('profile-files', 'cccccccc-0000-4000-8000-000000000003.pdf');
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.profile_drafts set content = jsonb_set(pg_temp.with_files(), '{resume,file}', '"aaaaaaaa-0000-4000-8000-000000000003"');
select pg_temp.expect_error($$select public.publish_profile(9)$$, 'another account''s file can''t be published', '55000');
commit;

-- ---------- Deleting files ----------
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.profile_drafts set content = pg_temp.with_files();
select pg_temp.expect_error($$delete from public.library_files where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'a file on the public site can''t be deleted', '23503');
update public.library_files set public_path = null where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.expect_error($$delete from public.library_files where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$, 'a file the draft uses can''t be deleted', '23503');
update public.profile_drafts set content = pg_temp.good();
delete from public.library_files where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 1 from public.library_files), 'an unused file can be deleted');
-- Restoring version 2 now points at a deleted file: publishing is refused, nothing changes.
update public.profile_drafts set content = (select content from public.profile_versions where version = 2);
select pg_temp.expect_error($$select public.publish_profile(12)$$, 'restored version whose file was deleted is refused', '55000');
select pg_temp.check((select version = 2 from public.profile_published), 'the public site keeps version 2');
commit;

-- Deleting an account still works when its files are marked public (cascade isn't blocked).
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
select pg_temp.check((select count(*) = 0 from public.library_files where user_id = '22222222-2222-4222-8222-222222222222'), 'account deletion removes its library rows');

-- ---------- Grants ----------
select pg_temp.check(not has_table_privilege('anon', 'public.library_files', 'select'), 'anon has no access to library_files');
select pg_temp.check(not has_column_privilege('authenticated', 'public.library_files', 'user_id', 'update'), 'owner id is fixed after upload');
select pg_temp.check(not has_function_privilege('authenticated', 'public.library_files_in_use()', 'execute'), 'trigger functions are not callable');
select pg_temp.check(has_function_privilege('authenticated', 'public.publish_profile(integer)', 'execute')
  and not has_function_privilege('anon', 'public.publish_profile(integer)', 'execute'), 'publish_profile stays authenticated-only');
