\set ON_ERROR_STOP 1
-- Phase 7C: boards, cards and connections (migration 019). Run as a superuser in a disposable
-- database after schema.sql and every migration. Creates its own rows and removes them at the end.
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

begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.projects (id, user_id, title, project_type) values
  ('c7000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Board project', 'hybrid'),
  ('c7000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Other project', 'hybrid');
insert into public.story_characters (id, user_id, project_id, name) values
  ('c7100000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'Mira'),
  ('c7100000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000002', 'Elsewhere');
insert into public.project_entries (id, user_id, project_id, kind, title) values
  ('c7200000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'experiment', 'Motor test');
insert into public.boards (id, user_id, project_id, title) values
  ('c7300000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'Plot'),
  ('c7300000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'Second board'),
  ('c7300000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000002', 'Other board');
insert into public.board_cards (id, user_id, project_id, board_id, kind, text, character_id, x, y) values
  ('c7400000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'character', '', 'c7100000-0000-4000-8000-000000000001', 10, 10);
insert into public.board_cards (id, user_id, project_id, board_id, kind, text, entry_id) values
  ('c7400000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'entry', '', 'c7200000-0000-4000-8000-000000000001');
insert into public.board_cards (id, user_id, project_id, board_id, kind, text) values
  ('c7400000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001', 'note', 'Big reveal here'),
  ('c7400000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002', 'note', 'On the second board');
insert into public.board_links (id, user_id, project_id, board_id, from_card_id, to_card_id, label) values
  ('c7500000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'c7000000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000001',
   'c7400000-0000-4000-8000-000000000001', 'c7400000-0000-4000-8000-000000000002', 'builds');
select pg_temp.check((select count(*) = 3 from public.boards) and (select count(*) = 4 from public.board_cards) and (select count(*) = 1 from public.board_links), 'owner adds boards, cards and a connection');

select pg_temp.expect_error($q$insert into public.board_cards (user_id, project_id, board_id, kind, character_id) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','character','c7100000-0000-4000-8000-000000000002')$q$, 'card linking a character from another project');
select pg_temp.expect_error($q$insert into public.board_cards (user_id, project_id, board_id, kind) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000003','note')$q$, 'card on another project''s board');
select pg_temp.expect_error($q$insert into public.board_cards (user_id, project_id, board_id, kind, character_id, entry_id) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','character','c7100000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000001')$q$, 'card linking two records');
select pg_temp.expect_error($q$insert into public.board_cards (user_id, project_id, board_id, kind) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','script')$q$, 'unknown card kind');
select pg_temp.expect_error($q$insert into public.board_cards (user_id, project_id, board_id, kind, x) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','note', 1e9)$q$, 'card far off the board');
select pg_temp.expect_error($q$insert into public.board_cards (user_id, project_id, board_id, kind, text) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','note', repeat('x', 2001))$q$, 'note over 2000 characters');
select pg_temp.expect_error($q$insert into public.board_links (user_id, project_id, board_id, from_card_id, to_card_id) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','c7400000-0000-4000-8000-000000000003','c7400000-0000-4000-8000-000000000004')$q$, 'connection to a card on another board');
select pg_temp.expect_error($q$insert into public.board_links (user_id, project_id, board_id, from_card_id, to_card_id) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','c7400000-0000-4000-8000-000000000003','c7400000-0000-4000-8000-000000000003')$q$, 'connection from a card to itself');
select pg_temp.expect_error($q$insert into public.board_links (user_id, project_id, board_id, from_card_id, to_card_id) values ('11111111-1111-4111-8111-111111111111','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','c7400000-0000-4000-8000-000000000002','c7400000-0000-4000-8000-000000000001')$q$, 'the same pair connected twice (either direction)');

-- Moving a card: version goes up; it can't change board.
update public.board_cards set x = 300, y = 200, board_id = 'c7300000-0000-4000-8000-000000000002' where id = 'c7400000-0000-4000-8000-000000000003';
select pg_temp.check((select x = 300 and version = 2 and board_id = 'c7300000-0000-4000-8000-000000000001' from public.board_cards where id = 'c7400000-0000-4000-8000-000000000003'), 'moving a card saves the position and keeps its board');
with u as (update public.board_cards set x = 1 where id = 'c7400000-0000-4000-8000-000000000003' and version = 1 returning 1)
select pg_temp.check((select count(*) = 0 from u), 'a move naming an old version changes nothing');

-- Deleting the linked record keeps the card (link cleared, shown as removed).
delete from public.story_characters where id = 'c7100000-0000-4000-8000-000000000001';
select pg_temp.check((select kind = 'character' and character_id is null from public.board_cards where id = 'c7400000-0000-4000-8000-000000000001'), 'a card outlives the record it pointed at');
select pg_temp.check((select count(*) = 1 from public.board_links), 'its connections are kept too');
-- Deleting a card removes its connections.
delete from public.board_cards where id = 'c7400000-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) = 0 from public.board_links), 'deleting a card removes its connections');
commit;

begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.boards) and (select count(*) = 0 from public.board_cards) and (select count(*) = 0 from public.board_links), 'another account sees no boards, cards or connections');
with u as (update public.board_cards set text = 'mine' returning 1) select pg_temp.check((select count(*) = 0 from u), 'another account changes no card');
select pg_temp.expect_error($q$insert into public.board_cards (user_id, project_id, board_id, kind) values ('22222222-2222-4222-8222-222222222222','c7000000-0000-4000-8000-000000000001','c7300000-0000-4000-8000-000000000001','note')$q$, 'another account adds a card to the owner''s board');
commit;

begin; select pg_temp.as_anon();
select pg_temp.expect_error($q$select count(*) from public.boards$q$, 'anon reads boards');
select pg_temp.expect_error($q$select count(*) from public.board_cards$q$, 'anon reads cards');
commit;
select pg_temp.check((select bool_and(not has_table_privilege('anon', t, 'select,insert,update,delete')) from unnest(array['public.boards','public.board_cards','public.board_links']) t), 'anon has no privileges on board tables');
select pg_temp.check((select bool_and(relrowsecurity) from pg_class where oid in ('public.boards'::regclass, 'public.board_cards'::regclass, 'public.board_links'::regclass)), 'row level security is on for all three');

begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.boards where id = 'c7300000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) = 0 from public.board_cards where board_id = 'c7300000-0000-4000-8000-000000000001'), 'deleting a board removes its own cards');
delete from public.projects where id in ('c7000000-0000-4000-8000-000000000001', 'c7000000-0000-4000-8000-000000000002');
select pg_temp.check((select count(*) = 0 from public.boards), 'deleting the projects removes their boards');
commit;
