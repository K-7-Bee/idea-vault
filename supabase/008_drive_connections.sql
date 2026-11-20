-- Phase 3A: the owner's Google Drive connection.
-- Additive only: one new table, no existing table, column or row is changed. Safe to run more than once.
--
-- Tokens are stored only as ciphertext sealed on the server with DRIVE_TOKEN_KEY (AES-256-GCM).
-- The app has no service-role key, so the owner's session can read this row, but the ciphertext is
-- useless without the server-only key. The checks below refuse anything that is not sealed.

begin;

create table if not exists public.drive_connections (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  google_account_id text not null check (char_length(google_account_id) between 1 and 200),
  google_email text not null check (char_length(google_email) between 3 and 320),
  -- Only the least-privilege scope can ever be recorded as granted.
  scope text not null check (scope = 'https://www.googleapis.com/auth/drive.file'),
  refresh_token_enc text not null check (refresh_token_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  access_token_enc text check (access_token_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'),
  access_token_expires_at timestamptz,
  key_version smallint not null default 1 check (key_version > 0),
  folder_id text check (folder_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  folder_name text check (char_length(folder_name) <= 500),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((folder_id is null) = (folder_name is null))
);

-- The database owns the owner and timestamps. A new refresh token means a new connection;
-- connecting a different Google account clears the folder, which belongs to the old account.
create or replace function public.drive_connections_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.connected_at := now();
    return new;
  end if;
  new.user_id := old.user_id;
  if new.refresh_token_enc is distinct from old.refresh_token_enc then
    new.connected_at := now();
  else
    new.connected_at := old.connected_at;
  end if;
  if new.google_account_id is distinct from old.google_account_id then
    new.folder_id := null;
    new.folder_name := null;
  end if;
  return new;
end;
$$;

drop trigger if exists drive_connections_touch on public.drive_connections;
create trigger drive_connections_touch before insert or update on public.drive_connections
  for each row execute function public.drive_connections_touch();

alter table public.drive_connections enable row level security;
revoke all on public.drive_connections from anon;
grant select, insert, update, delete on public.drive_connections to authenticated;

drop policy if exists "owner can read" on public.drive_connections;
drop policy if exists "owner can add" on public.drive_connections;
drop policy if exists "owner can edit" on public.drive_connections;
drop policy if exists "owner can delete" on public.drive_connections;
create policy "owner can read" on public.drive_connections for select to authenticated
  using (user_id = (select auth.uid()));
create policy "owner can add" on public.drive_connections for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "owner can edit" on public.drive_connections for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.drive_connections for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
