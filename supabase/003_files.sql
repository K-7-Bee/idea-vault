-- File and photo attachments. Paste into Supabase > SQL Editor > Run.

-- 1. A private storage bucket, 25 MB per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400);

-- 2. Only the logged-in owner can touch files, and only inside their own folder
--    (files are stored as <your user id>/<idea id>/<file>).
create policy "owner can read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner can upload own files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owner can delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3. A table that records which files belong to which idea.
create table public.idea_files (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null,
  name text not null,
  mime_type text,
  size bigint not null,
  created_at timestamptz not null default now()
);

create index idea_files_idea_idx on public.idea_files (idea_id);

alter table public.idea_files enable row level security;

create policy "owner can read own file records" on public.idea_files
  for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add own file records" on public.idea_files
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can delete own file records" on public.idea_files
  for delete to authenticated using (user_id = (select auth.uid()));
