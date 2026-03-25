-- Migration: reconcile duplicate genre/social/recommendation objects with the
-- canonical creation migration 20260219130000_missing_tables_billing_social_recs_genres.sql
--
-- This file intentionally avoids re-creating tables and policies that already
-- exist. It only normalizes columns, indexes, and the safe view so clean
-- replays and existing databases converge on the runtime schema.

-- ============================================================================
-- 1. genres — ensure the runtime "name" column exists and is populated
-- ============================================================================
alter table public.genres
  add column if not exists name text;

update public.genres
set name = coalesce(nullif(name, ''), nullif(name_en, ''), nullif(name_sv, ''), slug)
where name is null or btrim(name) = '';

alter table public.genres
  alter column name set not null;

create index if not exists idx_genres_display_order
  on public.genres (display_order, name_en);

-- ============================================================================
-- 2. book_genres — keep replay-safe indexes aligned with runtime queries
-- ============================================================================
create index if not exists idx_book_genres_book_id
  on public.book_genres (book_id);

create index if not exists idx_book_genres_genre_id
  on public.book_genres (genre_id);

-- ============================================================================
-- 3. social_connections_safe — keep the safe projection aligned with runtime
-- ============================================================================
create or replace view public.social_connections_safe as
  select
    id,
    user_id,
    platform,
    platform_user_id,
    platform_username,
    status,
    token_expires_at,
    connected_at,
    updated_at
  from public.social_connections;

create index if not exists idx_social_connections_user_id
  on public.social_connections (user_id);

-- ============================================================================
-- 4. recommendations — ensure replay-safe columns match runtime writes
-- ============================================================================
alter table public.recommendations
  add column if not exists reason text;

update public.recommendations
set reason = 'personalized'
where reason is null or btrim(reason) = '';

alter table public.recommendations
  alter column reason set default 'personalized';

alter table public.recommendations
  alter column reason set not null;

alter table public.recommendations
  add column if not exists batch_id text;

update public.recommendations
set batch_id = concat(user_id::text, '-', extract(epoch from coalesce(computed_at, now()))::bigint::text)
where batch_id is null or btrim(batch_id) = '';

alter table public.recommendations
  alter column batch_id set not null;

alter table public.recommendations
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_recommendations_user_rank
  on public.recommendations (user_id, rank);

create index if not exists idx_recommendations_batch
  on public.recommendations (batch_id);

-- ============================================================================
-- 5. reader preference / signal indexes used by recommendation flows
-- ============================================================================
alter table public.reader_genre_preferences
  add column if not exists weight real not null default 1.0;

create index if not exists idx_reader_genre_prefs_user
  on public.reader_genre_preferences (user_id);

create index if not exists idx_reader_signals_user
  on public.reader_book_signals (user_id);

create index if not exists idx_reader_signals_book
  on public.reader_book_signals (book_id);
