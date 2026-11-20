\set ON_ERROR_STOP 1
-- Phase 3A: drive_connections (migration 008). Run as a superuser in a disposable database after 008.
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
delete from public.drive_connections;

-- the owner stores a sealed connection; forged timestamps are replaced
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
insert into public.drive_connections (user_id, google_account_id, google_email, scope, refresh_token_enc, access_token_enc, access_token_expires_at, connected_at, updated_at)
values ('11111111-1111-4111-8111-111111111111', 'perm-1', 'owner@fixture.invalid', 'https://www.googleapis.com/auth/drive.file',
        'v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB.CCCC', 'v1.DDDDDDDDDDDDDDDD.EEEEEEEEEEEEEEEEEEEEEE.FFFF', now() + interval '1 hour', '2000-01-01', '2000-01-01');
select pg_temp.check((select connected_at > '2020-01-01' and updated_at > '2020-01-01' from public.drive_connections), 'insert: timestamps server-owned');
select pg_temp.expect_error($q$insert into public.drive_connections (user_id, google_account_id, google_email, scope, refresh_token_enc) values ('11111111-1111-4111-8111-111111111111','perm-1','owner@fixture.invalid','https://www.googleapis.com/auth/drive.file','v1.A.B.C')$q$, 'second row for the same owner');
commit;

-- only sealed tokens, only drive.file, only valid folder IDs
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
select pg_temp.expect_error($q$update public.drive_connections set refresh_token_enc='1//plain-refresh-token'$q$, 'plaintext refresh token');
select pg_temp.expect_error($q$update public.drive_connections set access_token_enc='ya29.plain-access'$q$, 'plaintext access token');
select pg_temp.expect_error($q$update public.drive_connections set scope='https://www.googleapis.com/auth/drive'$q$, 'broader scope');
select pg_temp.expect_error($q$update public.drive_connections set folder_id='../../etc', folder_name='x'$q$, 'bad folder id');
select pg_temp.expect_error($q$update public.drive_connections set folder_id='1Osl8Rzy2rkGUhml9B1Ez'$q$, 'folder id without name');
update public.drive_connections set folder_id='1Osl8Rzy2rkGUhml9B1Ez', folder_name='Vault Files';
select pg_temp.check((select folder_name='Vault Files' from public.drive_connections), 'folder saved');
commit;

-- the owner and connection time cannot be forged; a new grant restarts it; another account clears the folder
create temp table before_update as select connected_at from public.drive_connections;
grant select on before_update to public;
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.drive_connections set user_id='22222222-2222-4222-8222-222222222222', connected_at='2000-01-01', access_token_enc='v1.GGGGGGGGGGGGGGGG.HHHHHHHHHHHHHHHHHHHHHH.IIII';
select pg_temp.check((select user_id='11111111-1111-4111-8111-111111111111' and connected_at=(select connected_at from before_update) from public.drive_connections), 'update: owner and connected_at kept');
commit;
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
update public.drive_connections set refresh_token_enc='v1.JJJJJJJJJJJJJJJJ.KKKKKKKKKKKKKKKKKKKKKK.LLLL';
select pg_temp.check((select connected_at > (select connected_at from before_update) and folder_id is not null from public.drive_connections), 'new grant: connected_at restarts, same account keeps folder');
update public.drive_connections set google_account_id='perm-2', google_email='second@fixture.invalid';
select pg_temp.check((select folder_id is null and folder_name is null from public.drive_connections), 'other Google account clears folder');
commit;

-- another Vault user sees and changes nothing
begin; select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
select pg_temp.check((select count(*) = 0 from public.drive_connections), 'other user reads zero rows');
update public.drive_connections set google_email='stolen@fixture.invalid';
delete from public.drive_connections;
select pg_temp.expect_error($q$insert into public.drive_connections (user_id, google_account_id, google_email, scope, refresh_token_enc) values ('11111111-1111-4111-8111-111111111111','x','x@x.x','https://www.googleapis.com/auth/drive.file','v1.A.B.C')$q$, 'insert for another owner');
commit;
select pg_temp.check((select count(*) = 1 and bool_and(google_email='second@fixture.invalid') from public.drive_connections), 'other user changed and deleted nothing');

-- anonymous visitors have no access at all
begin; set local role anon;
select pg_temp.expect_error($q$select * from public.drive_connections$q$, 'anon read');
select pg_temp.expect_error($q$delete from public.drive_connections$q$, 'anon delete');
commit;

-- the owner can delete (disconnect)
begin; select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
delete from public.drive_connections;
select pg_temp.check((select count(*) = 0 from public.drive_connections), 'owner delete');
commit;
