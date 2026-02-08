-- Pricing hardening + scoped import metadata/policies.
-- Goals:
-- 1) Book-level pricing source of truth (price_amount, price_currency, pricing_model, is_free derived)
-- 2) Safe defaults for new books (free by default)
-- 3) Import rows linked to owned books with mode/result metadata and hardened RLS

-- ─────────────────────────────────────────────────────────────
-- Books pricing model
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS pricing_model text NOT NULL DEFAULT 'book_only';

-- Keep price_amount as the source-of-truth for free vs paid.
-- NULL or 0 => free, >=1 => paid.
ALTER TABLE public.books
  ALTER COLUMN price_amount DROP NOT NULL,
  ALTER COLUMN price_amount SET DEFAULT 0;

-- Keep currency constrained to explicit allowlist.
UPDATE public.books
SET price_currency = UPPER(price_currency)
WHERE price_currency IS NOT NULL;

ALTER TABLE public.books
  ALTER COLUMN price_currency SET DEFAULT 'USD';

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_price_amount_check,
  DROP CONSTRAINT IF EXISTS books_price_amount_non_negative_check,
  DROP CONSTRAINT IF EXISTS books_price_currency_allowlist_check,
  DROP CONSTRAINT IF EXISTS books_pricing_model_check,
  DROP CONSTRAINT IF EXISTS books_price_currency_upper_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_price_amount_non_negative_check
  CHECK (price_amount IS NULL OR price_amount >= 0),
  ADD CONSTRAINT books_price_currency_allowlist_check
  CHECK (price_currency IN ('SEK', 'EUR', 'USD')),
  ADD CONSTRAINT books_price_currency_upper_check
  CHECK (price_currency = UPPER(price_currency)),
  ADD CONSTRAINT books_pricing_model_check
  CHECK (pricing_model IN ('book_only'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'books'
      AND column_name = 'is_free'
  ) THEN
    ALTER TABLE public.books
      ADD COLUMN is_free boolean
      GENERATED ALWAYS AS (COALESCE(price_amount, 0) = 0) STORED;
  END IF;
END $$;

COMMENT ON COLUMN public.books.pricing_model IS 'Pricing strategy enum. Current supported value: book_only.';
COMMENT ON COLUMN public.books.is_free IS 'Derived from price_amount. True when price_amount is NULL or 0.';
COMMENT ON COLUMN public.books.price_amount IS 'Book price in minor units. NULL/0 means free, >=1 means paid.';
COMMENT ON COLUMN public.books.price_currency IS 'ISO 4217 code allowlist: SEK, EUR, USD.';

-- Ensure author updates remain ownership-safe.
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authors can update own books" ON public.books;
CREATE POLICY "Authors can update own books"
  ON public.books FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- ─────────────────────────────────────────────────────────────
-- Scoped import metadata + RLS hardening
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.book_imports
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'new_version',
  ADD COLUMN IF NOT EXISTS result jsonb;

ALTER TABLE public.book_imports
  DROP CONSTRAINT IF EXISTS book_imports_mode_check;

ALTER TABLE public.book_imports
  ADD CONSTRAINT book_imports_mode_check
  CHECK (mode IN ('new_version', 'overwrite_draft'));

COMMENT ON COLUMN public.book_imports.mode IS 'Import strategy for target book: new_version or overwrite_draft.';
COMMENT ON COLUMN public.book_imports.result IS 'Worker result payload (for example chapterCount and warnings).';

CREATE INDEX IF NOT EXISTS book_imports_book_id_created_idx
  ON public.book_imports(book_id, created_at DESC)
  WHERE book_id IS NOT NULL;

-- If book_id is present, it must belong to the same authenticated author.
DROP POLICY IF EXISTS book_imports_insert ON public.book_imports;
CREATE POLICY book_imports_insert ON public.book_imports
  FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND (
      book_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = book_imports.book_id
          AND b.author_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS book_imports_update ON public.book_imports;
CREATE POLICY book_imports_update ON public.book_imports
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (
    auth.uid() = author_id
    AND (
      book_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = book_imports.book_id
          AND b.author_id = auth.uid()
      )
    )
  );
