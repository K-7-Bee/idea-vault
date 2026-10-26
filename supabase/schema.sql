-- Ideas table. Paste this whole file into Supabase > SQL Editor > Run.
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null,
  status text not null default 'raw' check (status in ('raw', 'exploring', 'building', 'done')),
  created_at timestamptz not null default now()
);

create index ideas_user_created_idx on public.ideas (user_id, created_at desc);

-- Security: only the logged-in owner can see or change their own rows.
alter table public.ideas enable row level security;

create policy "owner can read own ideas" on public.ideas
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add own ideas" on public.ideas
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can edit own ideas" on public.ideas
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete own ideas" on public.ideas
  for delete to authenticated using (user_id = (select auth.uid()));
