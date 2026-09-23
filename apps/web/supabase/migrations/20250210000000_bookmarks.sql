-- Bookmarks: user_id + book_id, RLS select/insert/delete own

CREATE TABLE IF NOT EXISTS public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS bookmarks_book_id_idx ON public.bookmarks(book_id);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookmarks_select_own ON public.bookmarks;
CREATE POLICY bookmarks_select_own ON public.bookmarks
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS bookmarks_insert_own ON public.bookmarks;
CREATE POLICY bookmarks_insert_own ON public.bookmarks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS bookmarks_delete_own ON public.bookmarks;
CREATE POLICY bookmarks_delete_own ON public.bookmarks
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.bookmarks IS 'Reader bookmarks; RLS select/insert/delete own';

-- Allow authenticated users to insert their own analytics_events (for bookmark_added, bookmark_removed)
DROP POLICY IF EXISTS analytics_events_insert_own ON public.analytics_events;
CREATE POLICY analytics_events_insert_own ON public.analytics_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
