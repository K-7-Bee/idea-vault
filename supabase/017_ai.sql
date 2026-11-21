-- Phase 5A: the read-only Gemini assistant. Conversations (private, deletable) and a usage ledger
-- that the monthly ceiling and daily cap are computed from. Additive: three new tables and two
-- functions; no existing table changes. Safe to run more than once. Run 006 (projects) first.
--
--   * ai_conversations / ai_messages: owner-only, like every Vault table. A message keeps the
--     question or answer text and the labels and ids of the records that were sent, never the
--     records' text again.
--   * ai_usage: one row per request to the provider (token counts and estimated cost). The owner
--     can read it but not write, change or delete it; rows are added only by record_ai_usage(), so
--     the spending cap can't be edited away from the browser. Deleting conversations leaves usage.

begin;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null,
  mode text not null check (mode in ('engineering', 'story', 'planning')),
  title text not null default '' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);
create index if not exists ai_conversations_project_idx on public.ai_conversations (user_id, project_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null check (char_length(text) between 1 and 40000),
  -- [{"label": "L3", "table": "project_entries", "id": "<uuid>", "title": "..."}]: what was sent.
  sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 400),
  model text not null default '' check (char_length(model) <= 80),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- A message must belong to one of the caller's own conversations.
create or replace function public.ai_messages_owner_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.ai_conversations c where c.id = new.conversation_id and c.user_id = new.user_id) then
    raise exception 'Conversation not found.' using errcode = '23503';
  end if;
  -- clock_timestamp, not now(): a question and its answer are inserted together and must keep their order.
  new.created_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.ai_messages_owner_check() from public, anon, authenticated;
drop trigger if exists ai_messages_owner_check on public.ai_messages;
create trigger ai_messages_owner_check before insert on public.ai_messages
  for each row execute function public.ai_messages_owner_check();

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
revoke all on public.ai_conversations, public.ai_messages from anon, authenticated;
grant select, insert, delete on public.ai_conversations, public.ai_messages to authenticated;
grant update (title, updated_at) on public.ai_conversations to authenticated;
drop policy if exists "owner can read" on public.ai_conversations;
drop policy if exists "owner can add" on public.ai_conversations;
drop policy if exists "owner can edit" on public.ai_conversations;
drop policy if exists "owner can delete" on public.ai_conversations;
create policy "owner can read" on public.ai_conversations for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add" on public.ai_conversations for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can edit" on public.ai_conversations for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.ai_conversations for delete to authenticated using (user_id = (select auth.uid()));
drop policy if exists "owner can read" on public.ai_messages;
drop policy if exists "owner can add" on public.ai_messages;
drop policy if exists "owner can delete" on public.ai_messages;
create policy "owner can read" on public.ai_messages for select to authenticated using (user_id = (select auth.uid()));
create policy "owner can add" on public.ai_messages for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner can delete" on public.ai_messages for delete to authenticated using (user_id = (select auth.uid()));

-- ---------- Usage ledger ----------

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  model text not null check (char_length(model) <= 80),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  outcome text not null check (outcome in ('ok', 'error'))
);
create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
drop policy if exists "owner can read" on public.ai_usage;
create policy "owner can read" on public.ai_usage for select to authenticated using (user_id = (select auth.uid()));

-- Adds one request to the caller's ledger. Called by the server after every provider request,
-- including failed ones (cost 0 when nothing was billed).
create or replace function public.record_ai_usage(p_model text, p_input integer, p_output integer, p_cost numeric, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  insert into public.ai_usage (user_id, model, input_tokens, output_tokens, cost_usd, outcome)
  values (auth.uid(), p_model, p_input, p_output, p_cost, p_outcome);
end;
$$;
revoke all on function public.record_ai_usage(text, integer, integer, numeric, text) from public, anon;
grant execute on function public.record_ai_usage(text, integer, integer, numeric, text) to authenticated;

-- The caller's spend this calendar month and requests today (UTC), for the cap check and Settings.
create or replace function public.ai_usage_now()
returns table (month_usd numeric, today_requests integer)
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(u.cost_usd) filter (where u.created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'), 0),
         (count(*) filter (where u.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'))::integer
  from public.ai_usage u
  where u.user_id = (select auth.uid());
$$;
revoke all on function public.ai_usage_now() from public, anon;
grant execute on function public.ai_usage_now() to authenticated;

commit;
