-- Per-chapter pricing model: allow authors to sell individual chapters.

-- 1. Allow per_chapter pricing model on books
ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_pricing_model_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_pricing_model_check
  CHECK (pricing_model IN ('book_only', 'per_chapter'));

-- 2. Add chapter_id to orders for chapter-level purchases
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL;

-- 3. Add chapter_id to entitlements for chapter-level access grants
ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE;

-- 4. Replace the single unique constraint with partial indexes
--    so both book-level (chapter_id IS NULL) and chapter-level work.
ALTER TABLE public.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_user_id_book_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_book_level_uniq
  ON public.entitlements (user_id, book_id) WHERE chapter_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_chapter_level_uniq
  ON public.entitlements (user_id, book_id, chapter_id) WHERE chapter_id IS NOT NULL;

-- 5. Rebuild finalize_order_checkout_session to handle chapter_id
CREATE OR REPLACE FUNCTION public.finalize_order_checkout_session(
  p_stripe_session_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_stripe_session_id IS NULL OR btrim(p_stripe_session_id) = '' THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE stripe_session_id = p_stripe_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_order.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.orders
    SET status = 'paid'
    WHERE id = v_order.id
      AND status IN ('pending', 'failed');
  END IF;

  IF v_order.chapter_id IS NULL THEN
    INSERT INTO public.entitlements (user_id, book_id, source)
    VALUES (v_order.user_id, v_order.book_id, 'purchase')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.entitlements (user_id, book_id, chapter_id, source)
    VALUES (v_order.user_id, v_order.book_id, v_order.chapter_id, 'purchase')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_order_checkout_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_order_checkout_session(text) TO service_role;

COMMENT ON COLUMN public.books.pricing_model IS 'Pricing strategy: book_only (sell whole book) or per_chapter (sell individual chapters).';
COMMENT ON COLUMN public.orders.chapter_id IS 'For per-chapter purchases, the specific chapter. NULL for book-level purchases.';
COMMENT ON COLUMN public.entitlements.chapter_id IS 'For chapter-level entitlements, the specific chapter. NULL means full book access.';
