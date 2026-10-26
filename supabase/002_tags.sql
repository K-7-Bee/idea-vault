-- Adds tags to ideas. Paste into Supabase > SQL Editor > Run.
alter table public.ideas add column tags text[] not null default '{}';

-- Fill in tags for ideas you already saved (finds #words in the text).
update public.ideas i
set tags = coalesce((
  select array_agg(distinct lower(m[1]))
  from regexp_matches(i.content, '(?:^|\s)#([[:alnum:]_-]+)', 'g') as m
), '{}');

create index ideas_tags_idx on public.ideas using gin (tags);
