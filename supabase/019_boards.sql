-- Phase 7C: visual boards. Movable cards (a note, or a link to one real record: an image or file, a
-- sketch, a scene/shot, a character or a lab entry) and labelled connections between them.
-- Additive only and safe to run more than once. Run 018 first. Owner-only like every Vault table.
--
-- Cards point at records and never copy them. When a record is deleted the card stays and shows
-- "removed" (its link is cleared), so nothing on a board disappears silently. Deleting a board
-- removes its own cards and connections (board-only data), and the app asks first.

begin;

create unique index if not exists drawings_project_id_key on public.drawings (project_id, id);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  title text not null check (char_length(title) between 1 and 200),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (project_id, id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade
);

create table if not exists public.board_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  board_id uuid not null,
  kind text not null check (kind in ('note', 'file', 'drawing', 'unit', 'character', 'entry')),
  text text not null default '' check (char_length(text) <= 2000),
  colour text not null default 'yellow' check (colour in ('yellow', 'blue', 'green', 'pink', 'grey')),
  file_id uuid,
  drawing_id uuid,
  unit_id uuid,
  character_id uuid,
  entry_id uuid,
  x double precision not null default 40 check (x between -20000 and 20000),
  y double precision not null default 40 check (y between -20000 and 20000),
  w double precision not null default 220 check (w between 80 and 1200),
  h double precision not null default 160 check (h between 60 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (num_nonnulls(file_id, drawing_id, unit_id, character_id, entry_id) <= 1),
  unique (project_id, id),
  unique (board_id, id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, board_id) references public.boards (project_id, id) on delete cascade,
  foreign key (project_id, file_id) references public.project_files (project_id, id) on delete set null (file_id),
  foreign key (project_id, drawing_id) references public.drawings (project_id, id) on delete set null (drawing_id),
  foreign key (project_id, unit_id) references public.story_units (project_id, id) on delete set null (unit_id),
  foreign key (project_id, character_id) references public.story_characters (project_id, id) on delete set null (character_id),
  foreign key (project_id, entry_id) references public.project_entries (project_id, id) on delete set null (entry_id)
);

create table if not exists public.board_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null,
  board_id uuid not null,
  from_card_id uuid not null,
  to_card_id uuid not null,
  label text not null default '' check (char_length(label) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  check (from_card_id <> to_card_id),
  foreign key (project_id, user_id) references public.projects (id, user_id) on delete cascade,
  foreign key (project_id, board_id) references public.boards (project_id, id) on delete cascade,
  -- Both ends on this board (a card's (board_id, id) is unique).
  foreign key (board_id, from_card_id) references public.board_cards (board_id, id) on delete cascade,
  foreign key (board_id, to_card_id) references public.board_cards (board_id, id) on delete cascade
);

create unique index if not exists board_links_pair on public.board_links (board_id, least(from_card_id, to_card_id), greatest(from_card_id, to_card_id));
create index if not exists boards_project_idx on public.boards (project_id, position);
create index if not exists board_cards_board_idx on public.board_cards (board_id);
create index if not exists board_links_board_idx on public.board_links (board_id);

-- A card or connection never moves to another board.
create or replace function public.board_items_keep_board()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.board_id := old.board_id;
  if tg_table_name = 'board_links' then
    new.from_card_id := old.from_card_id;
    new.to_card_id := old.to_card_id;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['boards', 'board_cards', 'board_links']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
    execute format('drop policy if exists "owner can read" on public.%I', t);
    execute format('drop policy if exists "owner can add" on public.%I', t);
    execute format('drop policy if exists "owner can edit" on public.%I', t);
    execute format('drop policy if exists "owner can delete" on public.%I', t);
    execute format('create policy "owner can read" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "owner can add" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner can edit" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner can delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
    execute format('drop trigger if exists vault_touch_row on public.%I', t);
    execute format('create trigger vault_touch_row before insert or update on public.%I for each row execute function public.vault_touch_row(%L)', t, 'child');
  end loop;
  foreach t in array array['board_cards', 'board_links']
  loop
    execute format('drop trigger if exists board_items_keep_board on public.%I', t);
    execute format('create trigger board_items_keep_board before update on public.%I for each row execute function public.board_items_keep_board()', t);
  end loop;
end $$;

commit;
