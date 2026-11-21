\set ON_ERROR_STOP 1
-- Phase 5A: assistant conversations and the usage ledger (migration 017). Run as a superuser in a
-- disposable database after schema.sql and 002-017. Not live Supabase.
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
delete from public.ai_usage; delete from public.ai_messages; delete from public.ai_conversations;
delete from public.projects where id in ('dddddddd-0000-4000-8000-0000000000a1', 'dddddddd-0000-4000-8000-0000000000a2');
insert into public.projects (id, user_id, title, project_type, stage) values
  ('dddddddd-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'Owner project', 'hybrid', 'building'),
  ('dddddddd-0000-4000-8000-0000000000a2', '22222222-2222-4222-8222-222222222222', 'Other project', 'engineering', 'building');

begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.ai_conversations (id, user_id, project_id, mode, title) values
  ('cccccccc-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-0000000000a1', 'story', 'Where is the key?');
insert into public.ai_messages (conversation_id, user_id, role, text, sources) values
  ('cccccccc-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'user', 'Where is the key?', '[{"label": "S1", "table": "story_units", "id": "x", "title": "Market"}]'),
  ('cccccccc-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'assistant', 'In the drawer [S1].', '[]');
select pg_temp.check((select count(*) = 2 from public.ai_messages), 'owner keeps a conversation');
select pg_temp.check((select array_agg(role order by created_at) = array['user', 'assistant'] from public.ai_messages), 'a question and its answer keep their order');
select pg_temp.expect_error($$insert into public.ai_conversations (user_id, project_id, mode) values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-0000000000a2', 'story')$$, 'not on another account''s project', '23503');
select pg_temp.expect_error($$insert into public.ai_conversations (user_id, project_id, mode) values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-0000000000a1', 'chat')$$, 'only the three modes', '23514');
select pg_temp.expect_error($$update public.ai_messages set text = 'rewritten'$$, 'messages can''t be rewritten', '42501');
select pg_temp.expect_error($$update public.ai_conversations set project_id = 'dddddddd-0000-4000-8000-0000000000a2'$$, 'a conversation can''t move project', '42501');
-- Usage: only through record_ai_usage, never negative.
select public.record_ai_usage('gemini-3.8-flash', 8000, 1000, 0.00975, 'ok');
select public.record_ai_usage('gemini-3.8-flash', 0, 0, 0, 'error');
select pg_temp.check((select month_usd = 0.00975 and today_requests = 2 from public.ai_usage_now()), 'month spend and today''s requests');
select pg_temp.expect_error($$select public.record_ai_usage('m', 1, 1, -5, 'ok')$$, 'no negative cost', '23514');
select pg_temp.expect_error($$select public.record_ai_usage('m', -1, 1, 0, 'ok')$$, 'no negative tokens', '23514');
select pg_temp.expect_error($$insert into public.ai_usage (user_id, model, input_tokens, output_tokens, cost_usd, outcome) values ('11111111-1111-4111-8111-111111111111', 'm', 0, 0, 0, 'ok')$$, 'no direct writes to the ledger', '42501');
select pg_temp.expect_error($$delete from public.ai_usage$$, 'the ledger can''t be deleted', '42501');
select pg_temp.expect_error($$update public.ai_usage set cost_usd = 0$$, 'the ledger can''t be edited', '42501');
commit;

-- Last month's spend doesn't count; the cap restarts each month.
update public.ai_usage set created_at = now() - interval '40 days' where outcome = 'error';
insert into public.ai_usage (user_id, model, input_tokens, output_tokens, cost_usd, outcome, created_at)
values ('11111111-1111-4111-8111-111111111111', 'gemini-3.8-flash', 1, 1, 4.5, 'ok', now() - interval '40 days');
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.check((select month_usd = 0.00975 and today_requests = 1 from public.ai_usage_now()), 'older usage is outside this month and today');
commit;

begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.ai_conversations) and (select count(*) = 0 from public.ai_messages)
  and (select count(*) = 0 from public.ai_usage), 'another account sees no conversations, messages or usage');
select pg_temp.check((select month_usd = 0 and today_requests = 0 from public.ai_usage_now()), 'another account''s totals are its own');
select pg_temp.expect_error($$insert into public.ai_messages (conversation_id, user_id, role, text) values ('cccccccc-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222', 'user', 'hi')$$, 'can''t add to someone else''s conversation', '23503');
delete from public.ai_conversations;
commit;
select pg_temp.check((select count(*) = 1 from public.ai_conversations), 'another account can''t delete the owner''s conversation');

begin; select pg_temp.as_anon();
select pg_temp.expect_error($$select count(*) from public.ai_conversations$$, 'anon can''t read conversations', '42501');
select pg_temp.expect_error($$select count(*) from public.ai_usage$$, 'anon can''t read usage', '42501');
select pg_temp.expect_error($$select public.record_ai_usage('m', 0, 0, 0, 'ok')$$, 'anon can''t record usage', '42501');
select pg_temp.expect_error($$select * from public.ai_usage_now()$$, 'anon has no totals', '42501');
commit;

-- Deleting a conversation removes its messages; usage stays (it is the cap's record).
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.ai_conversations where id = 'cccccccc-0000-4000-8000-0000000000a1';
select pg_temp.check((select count(*) = 0 from public.ai_messages), 'messages go with their conversation');
select pg_temp.check((select count(*) = 3 from public.ai_usage), 'usage is kept');
commit;
-- Deleting the project removes its conversations.
insert into public.ai_conversations (user_id, project_id, mode) values ('11111111-1111-4111-8111-111111111111', 'dddddddd-0000-4000-8000-0000000000a1', 'planning');
delete from public.projects where id = 'dddddddd-0000-4000-8000-0000000000a1';
select pg_temp.check((select count(*) = 0 from public.ai_conversations), 'conversations go with their project');
select pg_temp.check(not has_function_privilege('authenticated', 'public.ai_messages_owner_check()', 'execute'), 'trigger function not callable');
