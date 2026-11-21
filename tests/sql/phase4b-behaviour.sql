\set ON_ERROR_STOP 1
-- Phase 4B: the public profile (migration 014). Run as a superuser in a disposable database after
-- schema.sql and 002-014. Not live Supabase.
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
-- A complete, publishable profile.
create or replace function pg_temp.good() returns jsonb language sql as $$ select '{
  "name": "Ada Example",
  "hero": {"eyebrow": "Engineering", "accent": "Curiosity meets", "headline": "engineering.", "intro": "I build things."},
  "highlights": [{"icon": "cap", "title": "Bachelor", "detail": "A university"}],
  "about": {"heading": "About me", "paragraphs": ["One.", "Two."]},
  "timeline": [{"kind": "work", "when": "2022", "title": "Internship", "detail": "A factory", "where": "Somewhere",
                "tools": ["Multimeter"], "responsibilities": ["Checked wiring"], "outcomes": []}],
  "certificates": [{"name": "First prize", "issuer": "Fair", "when": "2023", "href": ""}],
  "focus": ["Circuits"],
  "links": [{"label": "GitHub", "href": "https://github.com/example"}],
  "contact": {"heading": "Contact", "text": "Say hello.", "email": {"user": "me", "domain": "example.com"}}
}'::jsonb $$;
grant execute on function pg_temp.as_user(text), pg_temp.as_anon(), pg_temp.expect_error(text,text,text), pg_temp.check(boolean,text), pg_temp.good() to public;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@fixture.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'other@fixture.invalid')
on conflict (id) do nothing;
delete from public.profile_published; delete from public.profile_versions; delete from public.profile_drafts; delete from public.site_owner;

-- With two accounts the migration can't tell which is the owner, so it records none: nobody can publish.
select pg_temp.check((select count(*) = 0 from public.site_owner), 'no site owner is guessed when there are several accounts');

-- Owner drafts.
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.profile_drafts (user_id, content) values ('11111111-1111-4111-8111-111111111111', pg_temp.good());
select pg_temp.check((select version = 1 from public.profile_drafts), 'owner saves a draft (version 1)');
select pg_temp.expect_error($$select public.publish_profile(1)$$, 'publish refused while no site owner is recorded', '42501');
select pg_temp.expect_error($$insert into public.profile_drafts (user_id, content) values ('11111111-1111-4111-8111-111111111111', '{}')$$, 'second draft for the same owner', '23505');
select pg_temp.expect_error($$update public.profile_drafts set content = '[]'$$, 'draft content must be an object', '23514');
select pg_temp.expect_error($$insert into public.site_owner (user_id) values ('11111111-1111-4111-8111-111111111111')$$, 'owner cannot appoint themselves site owner');
commit;

-- The administrator records the owner (the migration does this itself when exactly one account exists).
insert into public.site_owner (user_id) values ('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_error($$insert into public.site_owner (user_id) values ('22222222-2222-4222-8222-222222222222')$$, 'only one site owner', '23505');

begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_error($$select public.publish_profile(7)$$, 'stale draft version', '40001');
select pg_temp.check((select public.publish_profile(1) = 1), 'owner publishes the confirmed draft as version 1');
select pg_temp.check((select version = 1 and content = pg_temp.good() from public.profile_published), 'public copy is the draft');
select pg_temp.check((select count(*) = 1 from public.profile_versions), 'history has version 1');
update public.profile_drafts set content = jsonb_set(pg_temp.good(), '{focus}', '["Robotics"]');
select pg_temp.check((select version = 2 from public.profile_drafts), 'edit bumps the draft version');
select pg_temp.check((select content -> 'focus' = '["Circuits"]' from public.profile_published), 'draft edits stay private until published');
select pg_temp.check((select public.publish_profile(2) = 2), 'publishes version 2');
select pg_temp.check((select version = 2 and content -> 'focus' = '["Robotics"]' from public.profile_published), 'public copy replaced');
select pg_temp.check((select count(*) = 2 and min(version) = 1 from public.profile_versions), 'history keeps every version');
-- Rollback: copy version 1 back into the draft, then publish it as version 3.
update public.profile_drafts set content = (select content from public.profile_versions where version = 1);
select pg_temp.check((select public.publish_profile(3) = 3), 'restored version publishes as version 3');
select pg_temp.check((select content = pg_temp.good() from public.profile_published), 'homepage back to version 1 content');
select pg_temp.check((select count(*) = 3 from public.profile_versions), 'rollback added to history, nothing rewritten');
-- Direct writes to the public copy and history are refused.
select pg_temp.expect_error($$update public.profile_published set content = '{}'$$, 'owner cannot edit the public copy directly');
select pg_temp.expect_error($$delete from public.profile_published$$, 'owner cannot delete the public copy directly');
select pg_temp.expect_error($$insert into public.profile_versions (user_id, version, content) values ('11111111-1111-4111-8111-111111111111', 99, '{}')$$, 'owner cannot write history directly');
select pg_temp.expect_error($$update public.profile_versions set content = '{}'$$, 'owner cannot rewrite history');
select pg_temp.expect_error($$delete from public.profile_versions$$, 'owner cannot delete history');
select pg_temp.expect_error($$select user_id from public.profile_published$$, 'owner id not readable even when signed in');
commit;

-- Content checks in publish_profile: each bad draft is refused and the public copy is unchanged.
create or replace function pg_temp.refused(change jsonb, label text) returns void language plpgsql as $$
declare v integer;
begin
  perform pg_temp.as_user('11111111-1111-4111-8111-111111111111');
  update public.profile_drafts set content = change returning version into v;
  perform pg_temp.expect_error(format('select public.publish_profile(%s)', v), label, '23514');
end $$;
grant execute on function pg_temp.refused(jsonb, text) to public;
begin;
select pg_temp.refused(jsonb_set(pg_temp.good(), '{links,0,href}', '"javascript:alert(1)"'), 'javascript: link');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{links,0,href}', '"http://example.com"'), 'http link');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{links,0,href}', '"data:text/html,hi"'), 'data: link');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{certificates,0,href}', '"javascript:alert(1)"'), 'javascript: certificate link');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{about,paragraphs,0}', '"<script>alert(1)</script>"'), 'HTML tag in text');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{timeline,0,responsibilities,0}', '"<img src=x onerror=alert(1)>"'), 'HTML tag in a list item');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{name}', '""'), 'empty name');
select pg_temp.refused(jsonb_set(jsonb_set(pg_temp.good(), '{hero,accent}', '""'), '{hero,headline}', '" "'), 'empty headline');
select pg_temp.refused(pg_temp.good() || '{"secret": "private notes"}', 'unknown section');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{highlights}', (select jsonb_agg(pg_temp.good() #> '{highlights,0}') from generate_series(1, 5))), 'five highlights');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{highlights,0,icon}', '"rocket"'), 'unknown icon');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{timeline,0,kind}', '"spy"'), 'unknown entry kind');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{timeline,0,title}', to_jsonb(repeat('x', 121))), 'entry title too long');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{timeline,0,tools}', '"Multimeter"'), 'tools not a list');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{contact,email,domain}', '"localhost"'), 'email without a dot in the domain');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{contact,email,user}', '"a b"'), 'email with a space');
select pg_temp.refused(jsonb_set(pg_temp.good(), '{focus}', '["a","b","c","d","e","f","g"]'), 'seven focus items');
select pg_temp.refused(pg_temp.good() - 'contact', 'missing contact section');
commit;
select pg_temp.check((select version = 3 and content = pg_temp.good() from public.profile_published), 'refused publishes left the public copy unchanged');
select pg_temp.check((select count(*) = 3 from public.profile_versions), 'refused publishes added no history');

-- Allowed edge cases: no email, a plain less-than sign, no certificates.
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.profile_drafts set content = jsonb_set(jsonb_set(jsonb_set(pg_temp.good(), '{contact,email}', '{"user": "", "domain": ""}'),
  '{focus}', '["C++ < Rust? 3 < 4"]'), '{certificates}', '[]');
select pg_temp.check((select public.publish_profile((select version from public.profile_drafts)) = 4), 'no email, plain < and no certificates publish');
commit;

-- Another signed-in account: own draft allowed, publishing and reading the owner's records refused.
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.profile_drafts), 'other account sees no owner draft');
select pg_temp.check((select count(*) = 0 from public.profile_versions), 'other account sees no owner history');
insert into public.profile_drafts (user_id, content) values ('22222222-2222-4222-8222-222222222222', pg_temp.good());
select pg_temp.expect_error($$select public.publish_profile(1)$$, 'other account cannot publish the homepage', '42501');
select pg_temp.expect_error($$insert into public.profile_drafts (user_id, content) values ('11111111-1111-4111-8111-111111111111', '{}')$$, 'other account cannot write the owner''s draft');
select pg_temp.check((select count(*) = 1 from (select content from public.profile_published) p), 'other account can read the public copy like any visitor');
commit;
select pg_temp.check((select version = 4 and user_id = '11111111-1111-4111-8111-111111111111' from public.profile_published), 'public copy still the owner''s');

-- Anonymous visitors.
begin; select pg_temp.as_anon();
select pg_temp.check((select count(*) = 1 and bool_and(published_at is not null) from (select content, published_at from public.profile_published) p), 'anon reads content and published_at');
select pg_temp.expect_error($$select user_id from public.profile_published$$, 'anon cannot read the owner id');
select pg_temp.expect_error($$select version from public.profile_published$$, 'anon cannot read the version');
select pg_temp.expect_error($$select * from public.profile_drafts$$, 'anon cannot read drafts');
select pg_temp.expect_error($$select * from public.profile_versions$$, 'anon cannot read history');
select pg_temp.expect_error($$select * from public.site_owner$$, 'anon cannot read the site owner');
select pg_temp.expect_error($$select public.publish_profile(1)$$, 'anon cannot publish');
select pg_temp.expect_error($$select public.profile_content_problem('{}')$$, 'anon cannot call the internal check');
select pg_temp.expect_error($$insert into public.profile_published (user_id, content, version) values ('22222222-2222-4222-8222-222222222222', '{}', 1)$$, 'anon cannot write the public copy');
commit;

-- Exactly one Auth account: the migration's own rule records it as the site owner.
begin;
delete from public.site_owner;
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
insert into public.site_owner (user_id) select u.id from auth.users u where (select count(*) from auth.users) = 1 on conflict (id) do nothing;
select pg_temp.check((select user_id = '11111111-1111-4111-8111-111111111111' from public.site_owner), 'a single account becomes the site owner');
rollback;

select pg_temp.check(true, 'phase 4b suite complete');
