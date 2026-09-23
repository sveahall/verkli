-- ---------------------------------------------------------------------------
-- Postgres full-text search (Phase 0.5 / ROADMAP §0.5).
--
-- Strategy: GENERATED tsvector columns + GIN indexes. No triggers needed —
-- Postgres 12+ keeps the tsvector in sync automatically on INSERT/UPDATE.
--
-- We use the 'simple' text-search config so the search behaves consistently
-- across Verkli's supported languages (multilingual books). For per-language
-- stemming we would need a `language` column on the row driving config
-- selection, which is a v2 refinement.
--
-- Weights: A = strongest (titles + display names), B = secondary
-- (descriptions + bios). `ts_rank_cd` consumes these weights for ordering.
-- ---------------------------------------------------------------------------

-- 1. books.search_vector ----------------------------------------------------
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS books_search_vector_idx
  ON public.books USING GIN (search_vector);

-- 2. profiles.search_vector -------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(username, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(bio, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS profiles_search_vector_idx
  ON public.profiles USING GIN (search_vector);

-- rollback:
--   DROP INDEX IF EXISTS public.profiles_search_vector_idx;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS search_vector;
--   DROP INDEX IF EXISTS public.books_search_vector_idx;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS search_vector;
