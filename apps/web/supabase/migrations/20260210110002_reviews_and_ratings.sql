-- Reader reviews and ratings.
-- Supports one rating per user per book, with optional version context.

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  book_version_id uuid REFERENCES public.book_versions(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS book_version_id uuid REFERENCES public.book_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Keep legacy rows from blocking constraints.
DELETE FROM public.reviews
WHERE user_id IS NULL
   OR book_id IS NULL
   OR rating IS NULL;

ALTER TABLE public.reviews
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN book_id SET NOT NULL,
  ALTER COLUMN rating SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.reviews
  ALTER COLUMN rating TYPE smallint USING rating::smallint;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5);

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, book_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.reviews
)
DELETE FROM public.reviews r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_user_id_book_id_key;
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_user_book_unique;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_user_book_unique UNIQUE (user_id, book_id);

CREATE INDEX IF NOT EXISTS reviews_book_id_idx ON public.reviews(book_id);
CREATE INDEX IF NOT EXISTS reviews_book_created_at_idx ON public.reviews(book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_book_version_id_idx ON public.reviews(book_version_id);

DROP TRIGGER IF EXISTS update_reviews_updated_at ON public.reviews;
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reviews are viewable by everyone" ON public.reviews;
DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can update own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Users can delete own reviews" ON public.reviews;
DROP POLICY IF EXISTS reviews_select ON public.reviews;
DROP POLICY IF EXISTS reviews_insert_own ON public.reviews;
DROP POLICY IF EXISTS reviews_update_own ON public.reviews;
DROP POLICY IF EXISTS reviews_delete_own ON public.reviews;

CREATE POLICY reviews_select ON public.reviews
  FOR SELECT
  USING (true);

CREATE POLICY reviews_insert_own ON public.reviews
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY reviews_update_own ON public.reviews
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY reviews_delete_own ON public.reviews
  FOR DELETE
  USING (auth.uid() = user_id);
