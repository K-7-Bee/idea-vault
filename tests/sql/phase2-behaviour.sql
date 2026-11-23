\set ON_ERROR_STOP 1
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

-- seed: the two accounts and the owner's two ideas the project checks below use (6C: the suite
-- used to rely on rows left by earlier runs, so it stopped on a fresh database)
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@fixture.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'other@fixture.invalid')
on conflict (id) do nothing;
insert into public.ideas (id, user_id, content) values
  ('a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'seed idea one'),
  ('a0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'seed idea three')
on conflict (id) do nothing;

-- legacy stage values from old clients are translated
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.ideas (id, content, status, user_id) values ('a0000000-0000-4000-8000-000000000009','legacy raw','raw','11111111-1111-4111-8111-111111111111');
select pg_temp.check((select status from public.ideas where id='a0000000-0000-4000-8000-000000000009')='exploring','legacy raw insert -> exploring');
update public.ideas set status='done' where id='a0000000-0000-4000-8000-000000000009';
select pg_temp.check((select status from public.ideas where id='a0000000-0000-4000-8000-000000000009')='completed','legacy done update -> completed');
insert into public.ideas (id, content, user_id) values ('a0000000-0000-4000-8000-00000000000a','default stage','11111111-1111-4111-8111-111111111111');
select pg_temp.check((select status from public.ideas where id='a0000000-0000-4000-8000-00000000000a')='exploring','default stage exploring');
select pg_temp.expect_error($q$update public.ideas set status='nonsense' where id='a0000000-0000-4000-8000-00000000000a'$q$,'unknown stage');
commit;

-- owner creates a project from an idea; forged fields are replaced
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.projects (id, user_id, title, project_type, source_idea_id, version, created_at, archived_at)
 values ('b0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Robot arm','hybrid','a0000000-0000-4000-8000-000000000003', 99, '2000-01-01', now());
select pg_temp.check((select version=1 and created_at > '2020-01-01' and archived_at is null and stage='exploring' and publication_status='private' from public.projects where id='b0000000-0000-4000-8000-000000000001'),'insert: version/created/archive server-owned, defaults private');
select pg_temp.expect_error($q$insert into public.projects (user_id,title,project_type,source_idea_id) values ('11111111-1111-4111-8111-111111111111','dup','story','a0000000-0000-4000-8000-000000000003')$q$,'second project from same idea');
update public.projects set title='Robot arm v2', version=500, source_idea_id='a0000000-0000-4000-8000-000000000001' where id='b0000000-0000-4000-8000-000000000001';
select pg_temp.check((select version=2 and source_idea_id='a0000000-0000-4000-8000-000000000003' from public.projects where id='b0000000-0000-4000-8000-000000000001'),'update: version +1, source idea cannot be repointed');
select pg_temp.expect_error($q$update public.projects set project_type='cooking' where id='b0000000-0000-4000-8000-000000000001'$q$,'bad project type');
select pg_temp.expect_error($q$update public.projects set publication_status='public' where id='b0000000-0000-4000-8000-000000000001'$q$,'bad publication status');
insert into public.project_milestones (id, user_id, project_id, title) values ('c0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','Prototype');
insert into public.project_tasks (id, user_id, project_id, title, milestone_id) values ('c0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','Wire servo','c0000000-0000-4000-8000-000000000001');
insert into public.project_entries (user_id, project_id, kind, title, link) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','evidence','Bench test','https://example.invalid/log');
select pg_temp.expect_error($q$insert into public.project_entries (user_id, project_id, kind, title, link) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','note','x','javascript:alert(1)')$q$,'non-http link');
insert into public.project_components (user_id, project_id, name, quantity, unit) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','MG996R servo',2,'pcs');
insert into public.project_links (user_id, project_id, label, url, kind) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','Repo','https://github.com/example/arm','repository');
delete from public.project_milestones where id='c0000000-0000-4000-8000-000000000001';
select pg_temp.check((select milestone_id is null and project_id='b0000000-0000-4000-8000-000000000001' from public.project_tasks where id='c0000000-0000-4000-8000-000000000002'),'milestone delete keeps task');
update public.project_tasks set project_id=gen_random_uuid() where id='c0000000-0000-4000-8000-000000000002';
select pg_temp.check((select project_id='b0000000-0000-4000-8000-000000000001' from public.project_tasks where id='c0000000-0000-4000-8000-000000000002'),'child cannot move project');
update public.projects set archived_at='1999-01-01' where id='b0000000-0000-4000-8000-000000000001';
select pg_temp.check((select archived_at > now() - interval '1 minute' from public.projects where id='b0000000-0000-4000-8000-000000000001'),'archive uses server time');
update public.projects set archived_at=null where id='b0000000-0000-4000-8000-000000000001';
commit;

-- story structure rules
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.story_units (id,user_id,project_id,kind,title) values ('d0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','season','S1');
insert into public.story_units (id,user_id,project_id,kind,title,parent_id) values ('d0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','scene','Scene skipping episode','d0000000-0000-4000-8000-000000000001');
insert into public.story_units (id,user_id,project_id,kind,title,parent_id) values ('d0000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','shot','Shot 1','d0000000-0000-4000-8000-000000000002');
select pg_temp.expect_error($q$insert into public.story_units (user_id,project_id,kind,title,parent_id) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','season','bad','d0000000-0000-4000-8000-000000000003')$q$,'season inside shot');
select pg_temp.expect_error($q$update public.story_units set kind='shot' where id='d0000000-0000-4000-8000-000000000002'$q$,'scene with shots becomes shot');
select pg_temp.expect_error($q$delete from public.story_units where id='d0000000-0000-4000-8000-000000000002'$q$,'delete scene that still contains shots');
insert into public.story_characters (id,user_id,project_id,name) values ('e0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','Mira'),('e0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','Oren');
insert into public.story_relationships (user_id,project_id,from_character_id,to_character_id,relationship) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','sister');
select pg_temp.expect_error($q$insert into public.story_relationships (user_id,project_id,from_character_id,to_character_id,relationship) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','self')$q$,'self relationship');
insert into public.story_continuity (id,user_id,project_id,subject,unit_id,character_id) values ('f0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','Scar on left hand','d0000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-000000000001');
insert into public.story_timeline_events (id,user_id,project_id,title,unit_id) values ('f0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','Storm hits','d0000000-0000-4000-8000-000000000003');
delete from public.story_units where id='d0000000-0000-4000-8000-000000000003';
select pg_temp.check((select unit_id is null and character_id is not null from public.story_continuity where id='f0000000-0000-4000-8000-000000000001'),'shot delete keeps continuity record, clears reference');
select pg_temp.check((select unit_id is null from public.story_timeline_events where id='f0000000-0000-4000-8000-000000000002'),'shot delete keeps timeline event');
commit;

-- other user: sees nothing, changes nothing, cannot attach to owner's project or idea
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) from public.projects)=0 and (select count(*) from public.project_tasks)=0 and (select count(*) from public.story_units)=0 and (select count(*) from public.story_characters)=0,'other user reads zero rows');
with u as (update public.projects set title='hijack' returning 1) select pg_temp.check((select count(*) from u)=0,'other user updates zero projects');
with d as (delete from public.project_tasks returning 1) select pg_temp.check((select count(*) from d)=0,'other user deletes zero tasks');
select pg_temp.expect_error($q$insert into public.project_tasks (user_id,project_id,title) values ('22222222-2222-4222-8222-222222222222','b0000000-0000-4000-8000-000000000001','intrude')$q$,'other user task in owner project');
select pg_temp.expect_error($q$insert into public.project_tasks (user_id,project_id,title) values ('11111111-1111-4111-8111-111111111111','b0000000-0000-4000-8000-000000000001','forge owner')$q$,'other user forging owner id');
select pg_temp.expect_error($q$insert into public.projects (user_id,title,project_type,source_idea_id) values ('22222222-2222-4222-8222-222222222222','steal','story','a0000000-0000-4000-8000-000000000001')$q$,'other user project from owner idea');
commit;

-- anonymous: no access at all
begin; select set_config('role','anon',true);
select pg_temp.expect_error($q$select 1 from public.projects$q$,'anon select projects');
select pg_temp.expect_error($q$select 1 from public.story_continuity$q$,'anon select continuity');
commit;

-- deleting the source idea keeps the project
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.ideas where id='a0000000-0000-4000-8000-000000000003';
select pg_temp.check((select source_idea_id is null and title='Robot arm v2' from public.projects where id='b0000000-0000-4000-8000-000000000001'),'idea delete keeps project');
rollback;
