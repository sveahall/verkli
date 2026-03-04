alter table if exists public.shelves
  add column if not exists subtitle text,
  add column if not exists cover_type text default 'image',
  add column if not exists cover_gradient text,
  add column if not exists typography jsonb,
  add column if not exists sort_index int not null default 0;
