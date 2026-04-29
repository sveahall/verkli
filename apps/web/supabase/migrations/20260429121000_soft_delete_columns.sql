-- ---------------------------------------------------------------------------
-- Sprint 0.5 — Soft-delete foundation (Task 2).
--
-- Adds `deleted_at TIMESTAMPTZ NULL` to user-facing content tables so that
-- moderation, undo, and GDPR fulfilment can hide rows without losing them.
--
-- Strategy:
--   1. Column add — non-destructive (`IF NOT EXISTS`).
--   2. Partial index `(id) WHERE deleted_at IS NULL` so active-row reads stay
--      cheap.
--   3. RLS backstop — RESTRICTIVE policy that hides soft-deleted rows from
--      every authenticated/anon read regardless of any PERMISSIVE policy. The
--      service role bypasses RLS so admin tooling continues to work without
--      special-casing.
--
-- The application code that writes the column lives in `lib/db/soft-delete.ts`
-- and is rolled out site-by-site (see docs/sprint-0.5-deferred.md). The
-- RESTRICTIVE policy added here means even un-instrumented SELECT sites are
-- safe by default.
-- ---------------------------------------------------------------------------

-- 1. Columns ----------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'books',
    'chapters',
    'comments',
    'messages',
    'marketing_campaigns',
    'marketing_posts',
    'reviews',
    'polls',
    'poll_options',
    'book_clubs',
    'book_club_messages'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
      t
    );
  END LOOP;
END $$;

-- 2. Partial active indexes -------------------------------------------------
CREATE INDEX IF NOT EXISTS books_active_idx
  ON public.books (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS chapters_active_idx
  ON public.chapters (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS comments_active_idx
  ON public.comments (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_active_idx
  ON public.messages (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_campaigns_active_idx
  ON public.marketing_campaigns (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS marketing_posts_active_idx
  ON public.marketing_posts (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS reviews_active_idx
  ON public.reviews (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS polls_active_idx
  ON public.polls (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS poll_options_active_idx
  ON public.poll_options (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS book_clubs_active_idx
  ON public.book_clubs (id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS book_club_messages_active_idx
  ON public.book_club_messages (id) WHERE deleted_at IS NULL;

-- 3. RLS backstop -----------------------------------------------------------
-- RESTRICTIVE policies are AND'd with PERMISSIVE policies. We add one per
-- table that says "the row must not be soft-deleted". Service role bypasses
-- RLS entirely, so admin queries still see soft-deleted rows.
DO $$
DECLARE
  t text;
  policy_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'books',
    'chapters',
    'comments',
    'messages',
    'marketing_campaigns',
    'marketing_posts',
    'reviews',
    'polls',
    'poll_options',
    'book_clubs',
    'book_club_messages'
  ] LOOP
    policy_name := t || '_hide_soft_deleted';

    -- Drop and recreate to make the migration replay-safe.
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      policy_name, t
    );

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated, anon
      USING (deleted_at IS NULL)
    $f$, policy_name, t);
  END LOOP;
END $$;
