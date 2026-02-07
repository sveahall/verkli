-- Purchase monetization v1 (book-level purchases only)
-- Scope: orders + entitlements + minimal pricing fields on books

-- Books: minimal pricing source-of-truth
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS price_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_currency text NOT NULL DEFAULT 'USD';

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_price_amount_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_price_amount_check
  CHECK (price_amount >= 0);

COMMENT ON COLUMN public.books.price_amount IS 'Book price in minor units (for example 499 = $4.99). 0 means free book.';
COMMENT ON COLUMN public.books.price_currency IS 'ISO 4217 currency code (for example USD).';

-- Orders: one row per checkout attempt
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount >= 0),
  currency text NOT NULL,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS orders_book_id_idx ON public.orders(book_id);
CREATE INDEX IF NOT EXISTS orders_user_book_created_idx ON public.orders(user_id, book_id, created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_select_own ON public.orders;
CREATE POLICY orders_select_own ON public.orders
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS orders_insert_own ON public.orders;
CREATE POLICY orders_insert_own ON public.orders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS orders_update_own ON public.orders;
CREATE POLICY orders_update_own ON public.orders
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.orders IS 'Book purchase attempts. Status lifecycle: pending -> paid|failed.';

-- Entitlements: grants book access after successful purchase
CREATE TABLE IF NOT EXISTS public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('purchase')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS entitlements_user_id_idx ON public.entitlements(user_id);
CREATE INDEX IF NOT EXISTS entitlements_book_id_idx ON public.entitlements(book_id);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entitlements_select_own ON public.entitlements;
CREATE POLICY entitlements_select_own ON public.entitlements
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS entitlements_insert_own ON public.entitlements;
CREATE POLICY entitlements_insert_own ON public.entitlements
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.entitlements IS 'Book access grants. purchase = successful one-time full-book purchase.';
