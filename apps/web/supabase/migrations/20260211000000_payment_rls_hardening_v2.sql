-- Payment RLS hardening v2
-- Defense-in-depth: DB-level safety net for purchase flow.
-- No policy changes — only adds a read-access function and two triggers.

-- ─────────────────────────────────────────────────────────────
-- 1. can_user_read_book(p_user_id, p_book_id)
-- ─────────────────────────────────────────────────────────────
-- Mirrors: src/lib/books/access.ts → canUserReadBook()
-- Returns true when:
--   a) book is free  (price_amount IS NULL or < 1)
--   b) caller is the book author
--   c) caller has an entitlement row
-- Fail-closed: returns false when book is missing.

CREATE OR REPLACE FUNCTION public.can_user_read_book(
  p_user_id uuid,
  p_book_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    (
      SELECT
        CASE
          -- Free book: anyone can read
          WHEN COALESCE(b.price_amount, 0) < 1 THEN true
          -- Author always has access to own book
          WHEN p_user_id IS NOT NULL AND b.author_id = p_user_id THEN true
          -- Paid book: check entitlement
          WHEN p_user_id IS NOT NULL AND EXISTS (
            SELECT 1
            FROM public.entitlements e
            WHERE e.user_id = p_user_id
              AND e.book_id = p_book_id
          ) THEN true
          -- Default: no access
          ELSE false
        END
      FROM public.books b
      WHERE b.id = p_book_id
    ),
    false  -- book not found → fail closed
  );
$$;

COMMENT ON FUNCTION public.can_user_read_book(uuid, uuid) IS
  'Content-gating check. True for free books, book author, or entitled users. Fail-closed.';


-- ─────────────────────────────────────────────────────────────
-- 2. Trigger: prevent author self-purchase on orders
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_author_self_purchase()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.books b
    WHERE b.id = NEW.book_id
      AND b.author_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'AUTHOR_CANNOT_BUY_OWN_BOOK: user % is the author of book %',
      NEW.user_id, NEW.book_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop + create so migration is re-runnable.
DROP TRIGGER IF EXISTS trg_prevent_author_self_purchase ON public.orders;

CREATE TRIGGER trg_prevent_author_self_purchase
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_author_self_purchase();

COMMENT ON FUNCTION public.prevent_author_self_purchase() IS
  'Defense-in-depth: blocks order creation when buyer is the book author.';


-- ─────────────────────────────────────────────────────────────
-- 3. Trigger: require paid order for purchase entitlements
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.require_paid_order_for_purchase_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only enforce for source = 'purchase'.
  -- Future sources (admin_grant, promo, etc.) pass through.
  IF NEW.source = 'purchase' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.user_id = NEW.user_id
        AND o.book_id = NEW.book_id
        AND o.status  = 'paid'
    ) THEN
      RAISE EXCEPTION 'PURCHASE_REQUIRES_PAID_ORDER: no paid order for user % book %',
        NEW.user_id, NEW.book_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop + create so migration is re-runnable.
DROP TRIGGER IF EXISTS trg_require_paid_order_entitlement ON public.entitlements;

CREATE TRIGGER trg_require_paid_order_entitlement
  BEFORE INSERT ON public.entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.require_paid_order_for_purchase_entitlement();

COMMENT ON FUNCTION public.require_paid_order_for_purchase_entitlement() IS
  'Defense-in-depth: purchase entitlements require a matching paid order row.';


-- ─────────────────────────────────────────────────────────────
-- Smoke-test snippets (run in Supabase SQL editor)
-- ─────────────────────────────────────────────────────────────
--
-- A) can_user_read_book — nonexistent book → false
--    SELECT public.can_user_read_book('00000000-0000-0000-0000-000000000001'::uuid,
--                                     '00000000-0000-0000-0000-000000000099'::uuid);
--    -- Expected: false
--
-- B) author self-purchase trigger
--    -- Attempt INSERT into orders where user_id = books.author_id
--    INSERT INTO public.orders (user_id, book_id, amount, currency, provider)
--    VALUES ('<author-uuid>', '<their-book-uuid>', 4900, 'SEK', 'stripe');
--    -- Expected: ERROR  AUTHOR_CANNOT_BUY_OWN_BOOK
--
-- C) entitlement without paid order
--    INSERT INTO public.entitlements (user_id, book_id, source)
--    VALUES ('<user-uuid>', '<book-uuid>', 'purchase');
--    -- Expected: ERROR  PURCHASE_REQUIRES_PAID_ORDER
--
-- D) happy path: create paid order, then entitlement succeeds
--    INSERT INTO public.orders (user_id, book_id, amount, currency, provider, status)
--    VALUES ('<reader-uuid>', '<book-uuid>', 4900, 'SEK', 'stripe', 'paid');
--    INSERT INTO public.entitlements (user_id, book_id, source)
--    VALUES ('<reader-uuid>', '<book-uuid>', 'purchase');
--    -- Expected: both succeed
