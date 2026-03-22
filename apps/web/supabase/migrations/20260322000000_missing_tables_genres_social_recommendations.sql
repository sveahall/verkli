-- Migration: Create 7 missing tables referenced in application code
-- Tables: genres, book_genres, social_connections, social_connections_safe (view),
--         recommendations, reader_genre_preferences, reader_book_signals

-- ============================================================================
-- 1. genres — master list of book genres
-- ============================================================================
create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_sv text not null,
  name_en text not null,
  icon text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.genres enable row level security;

create policy "genres_select_public" on public.genres
  for select using (true);

create index if not exists idx_genres_display_order on public.genres (display_order, name_en);

-- ============================================================================
-- 2. book_genres — many-to-many join between books and genres
-- ============================================================================
create table if not exists public.book_genres (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (book_id, genre_id)
);

alter table public.book_genres enable row level security;

create policy "book_genres_select_public" on public.book_genres
  for select using (true);

-- Authors can manage genres for their own books
create policy "book_genres_insert_author" on public.book_genres
  for insert with check (
    exists (select 1 from public.books where id = book_id and author_id = auth.uid())
  );

create policy "book_genres_delete_author" on public.book_genres
  for delete using (
    exists (select 1 from public.books where id = book_id and author_id = auth.uid())
  );

create index if not exists idx_book_genres_book_id on public.book_genres (book_id);
create index if not exists idx_book_genres_genre_id on public.book_genres (genre_id);

-- ============================================================================
-- 3. social_connections — OAuth tokens for social publishing
-- ============================================================================
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  status text not null default 'active',
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  email_config_enc text,
  platform_user_id text,
  platform_username text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

alter table public.social_connections enable row level security;

create policy "social_connections_select_own" on public.social_connections
  for select using (auth.uid() = user_id);

create policy "social_connections_insert_own" on public.social_connections
  for insert with check (auth.uid() = user_id);

create policy "social_connections_update_own" on public.social_connections
  for update using (auth.uid() = user_id);

create policy "social_connections_delete_own" on public.social_connections
  for delete using (auth.uid() = user_id);

create index if not exists idx_social_connections_user_id on public.social_connections (user_id);

-- ============================================================================
-- 4. social_connections_safe — view without encrypted token columns
-- ============================================================================
create or replace view public.social_connections_safe as
  select
    id,
    user_id,
    platform,
    status,
    platform_user_id,
    platform_username,
    token_expires_at,
    connected_at,
    updated_at
  from public.social_connections;

-- ============================================================================
-- 5. recommendations — precomputed personalized book recommendations
-- ============================================================================
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  score numeric not null default 0,
  reason text,
  rank integer not null default 0,
  batch_id text,
  computed_at timestamptz not null default now(),
  unique (user_id, book_id)
);

alter table public.recommendations enable row level security;

create policy "recommendations_select_own" on public.recommendations
  for select using (auth.uid() = user_id);

create index if not exists idx_recommendations_user_rank on public.recommendations (user_id, rank);
create index if not exists idx_recommendations_batch on public.recommendations (batch_id);

-- ============================================================================
-- 6. reader_genre_preferences — reader's preferred genres for personalization
-- ============================================================================
create table if not exists public.reader_genre_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete cascade,
  weight numeric not null default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, genre_id)
);

alter table public.reader_genre_preferences enable row level security;

create policy "reader_genre_prefs_select_own" on public.reader_genre_preferences
  for select using (auth.uid() = user_id);

create policy "reader_genre_prefs_insert_own" on public.reader_genre_preferences
  for insert with check (auth.uid() = user_id);

create policy "reader_genre_prefs_update_own" on public.reader_genre_preferences
  for update using (auth.uid() = user_id);

create policy "reader_genre_prefs_delete_own" on public.reader_genre_preferences
  for delete using (auth.uid() = user_id);

create index if not exists idx_reader_genre_prefs_user on public.reader_genre_preferences (user_id);

-- ============================================================================
-- 7. reader_book_signals — like/skip signals for recommendation training
-- ============================================================================
create table if not exists public.reader_book_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  signal text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

alter table public.reader_book_signals enable row level security;

create policy "reader_signals_select_own" on public.reader_book_signals
  for select using (auth.uid() = user_id);

create policy "reader_signals_insert_own" on public.reader_book_signals
  for insert with check (auth.uid() = user_id);

create policy "reader_signals_update_own" on public.reader_book_signals
  for update using (auth.uid() = user_id);

create policy "reader_signals_delete_own" on public.reader_book_signals
  for delete using (auth.uid() = user_id);

create index if not exists idx_reader_signals_user on public.reader_book_signals (user_id);
create index if not exists idx_reader_signals_book on public.reader_book_signals (book_id);

-- ============================================================================
-- Seed: default genres
-- ============================================================================
insert into public.genres (slug, name_sv, name_en, display_order) values
  ('fiction',        'Skönlitteratur',    'Fiction',           1),
  ('non-fiction',    'Facklitteratur',    'Non-Fiction',       2),
  ('fantasy',        'Fantasy',           'Fantasy',           3),
  ('sci-fi',         'Science fiction',   'Science Fiction',   4),
  ('romance',        'Romance',           'Romance',           5),
  ('thriller',       'Thriller',          'Thriller',          6),
  ('mystery',        'Deckare',           'Mystery',           7),
  ('horror',         'Skräck',            'Horror',            8),
  ('literary',       'Litterär fiktion',  'Literary Fiction',  9),
  ('biography',      'Biografi',          'Biography',        10),
  ('history',        'Historia',          'History',           11),
  ('self-help',      'Självhjälp',        'Self-Help',        12),
  ('poetry',         'Poesi',             'Poetry',            13),
  ('young-adult',    'Ungdomslitteratur', 'Young Adult',       14),
  ('children',       'Barnböcker',        'Children',          15)
on conflict (slug) do nothing;
