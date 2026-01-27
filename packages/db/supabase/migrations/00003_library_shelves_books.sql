create extension if not exists pgcrypto;

-- Helper to keep updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.shelves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cover_url text,
  description text,
  authors_note text,
  tags text[] default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shelf_sections (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references public.shelves(id) on delete cascade,
  name text not null,
  sort_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text,
  cover_url text,
  summary text,
  authors_note text,
  content text,
  tags text[] default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shelf_books (
  id uuid primary key default gen_random_uuid(),
  shelf_id uuid not null references public.shelves(id) on delete cascade,
  book_id uuid not null references public.library_books(id) on delete cascade,
  section_id uuid references public.shelf_sections(id) on delete set null,
  sort_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shelf_id, book_id)
);

create index if not exists shelves_user_id_idx on public.shelves(user_id);
create index if not exists shelf_sections_shelf_id_idx on public.shelf_sections(shelf_id);
create index if not exists library_books_user_id_idx on public.library_books(user_id);
create index if not exists shelf_books_shelf_id_idx on public.shelf_books(shelf_id);
create index if not exists shelf_books_book_id_idx on public.shelf_books(book_id);
create index if not exists shelf_books_section_id_idx on public.shelf_books(section_id);

drop trigger if exists set_updated_at_on_shelves on public.shelves;
create trigger set_updated_at_on_shelves
before update on public.shelves
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_shelf_sections on public.shelf_sections;
create trigger set_updated_at_on_shelf_sections
before update on public.shelf_sections
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_library_books on public.library_books;
create trigger set_updated_at_on_library_books
before update on public.library_books
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_on_shelf_books on public.shelf_books;
create trigger set_updated_at_on_shelf_books
before update on public.shelf_books
for each row execute function public.set_updated_at();

alter table public.shelves enable row level security;
alter table public.shelf_sections enable row level security;
alter table public.library_books enable row level security;
alter table public.shelf_books enable row level security;

-- shelves policies
create policy "shelves_select_own"
on public.shelves for select
using (user_id = auth.uid());

create policy "shelves_insert_own"
on public.shelves for insert
with check (user_id = auth.uid());

create policy "shelves_update_own"
on public.shelves for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "shelves_delete_own"
on public.shelves for delete
using (user_id = auth.uid());

-- library_books policies
create policy "library_books_select_own"
on public.library_books for select
using (user_id = auth.uid());

create policy "library_books_insert_own"
on public.library_books for insert
with check (user_id = auth.uid());

create policy "library_books_update_own"
on public.library_books for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "library_books_delete_own"
on public.library_books for delete
using (user_id = auth.uid());

-- shelf_sections policies
create policy "shelf_sections_select_own"
on public.shelf_sections for select
using (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_sections.shelf_id
      and s.user_id = auth.uid()
  )
);

create policy "shelf_sections_insert_own"
on public.shelf_sections for insert
with check (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_sections.shelf_id
      and s.user_id = auth.uid()
  )
);

create policy "shelf_sections_update_own"
on public.shelf_sections for update
using (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_sections.shelf_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_sections.shelf_id
      and s.user_id = auth.uid()
  )
);

create policy "shelf_sections_delete_own"
on public.shelf_sections for delete
using (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_sections.shelf_id
      and s.user_id = auth.uid()
  )
);

-- shelf_books policies
create policy "shelf_books_select_own"
on public.shelf_books for select
using (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_books.shelf_id
      and s.user_id = auth.uid()
  )
);

create policy "shelf_books_insert_own"
on public.shelf_books for insert
with check (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_books.shelf_id
      and s.user_id = auth.uid()
  )
);

create policy "shelf_books_update_own"
on public.shelf_books for update
using (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_books.shelf_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_books.shelf_id
      and s.user_id = auth.uid()
  )
);

create policy "shelf_books_delete_own"
on public.shelf_books for delete
using (
  exists (
    select 1
    from public.shelves s
    where s.id = shelf_books.shelf_id
      and s.user_id = auth.uid()
  )
);
