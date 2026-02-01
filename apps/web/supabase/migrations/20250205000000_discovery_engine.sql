-- Discovery engine v0: featured books, curated_lists, curated_list_items. RLS: SELECT public for readers; write via service role only.

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_rank integer,
  ADD COLUMN IF NOT EXISTS featured_until timestamptz;

CREATE INDEX IF NOT EXISTS books_is_featured_language_idx ON public.books(is_featured, language) WHERE is_featured = true;
COMMENT ON COLUMN public.books.is_featured IS 'Editorial featured flag for discovery';
COMMENT ON COLUMN public.books.featured_rank IS 'Order in featured rail (lower first)';
COMMENT ON COLUMN public.books.featured_until IS 'Feature expires at (null = no expiry)';

-- ─────────────────────────────────────────────────────────────
-- Curated lists
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.curated_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS curated_lists_language_active_idx ON public.curated_lists(language, is_active) WHERE is_active = true;

-- ─────────────────────────────────────────────────────────────
-- Curated list items
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.curated_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.curated_lists(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  rank integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, book_id)
);

CREATE INDEX IF NOT EXISTS curated_list_items_list_rank_idx ON public.curated_list_items(list_id, rank);

-- RLS: readers can SELECT active lists and all items (filter published books in app). No insert/update/delete policies = service role only for writes.
ALTER TABLE public.curated_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curated_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS curated_lists_select ON public.curated_lists;
CREATE POLICY curated_lists_select ON public.curated_lists
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS curated_list_items_select ON public.curated_list_items;
CREATE POLICY curated_list_items_select ON public.curated_list_items
  FOR SELECT
  USING (true);

COMMENT ON TABLE public.curated_lists IS 'Curated discovery lists per language; managed via SQL/service role';
COMMENT ON TABLE public.curated_list_items IS 'Books in a curated list; join to books for published filter';
