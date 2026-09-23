-- reading_progress: per-user reading position with cross-device merge.
--
-- Merge semantics enforced by the upsert query (not at the DB layer):
--   - chapter_id  = the row with the higher client_seq wins
--   - scroll_pos  = MAX within the same chapter; on chapter change, take the
--                   incoming row's scroll_pos iff client_seq is higher
--
-- client_seq is a per-user monotonic sequence number sent by the client.
-- The server clamps writes so client_seq never goes backward.

CREATE TABLE IF NOT EXISTS public.reading_progress (
  user_id          uuid        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  book_id          uuid        NOT NULL REFERENCES public.books(id)      ON DELETE CASCADE,
  book_version_id  uuid        NULL     REFERENCES public.book_versions(id) ON DELETE SET NULL,
  chapter_id       uuid        NULL     REFERENCES public.chapters(id)   ON DELETE SET NULL,
  scroll_position  int         NOT NULL DEFAULT 0 CHECK (scroll_position >= 0),
  client_seq       bigint      NOT NULL DEFAULT 0 CHECK (client_seq >= 0),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS reading_progress_book_id_idx
  ON public.reading_progress(book_id);

CREATE INDEX IF NOT EXISTS reading_progress_updated_at_idx
  ON public.reading_progress(updated_at DESC);

ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reading_progress_select_own ON public.reading_progress;
CREATE POLICY reading_progress_select_own
  ON public.reading_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS reading_progress_insert_own ON public.reading_progress;
CREATE POLICY reading_progress_insert_own
  ON public.reading_progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS reading_progress_update_own ON public.reading_progress;
CREATE POLICY reading_progress_update_own
  ON public.reading_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS reading_progress_delete_own ON public.reading_progress;
CREATE POLICY reading_progress_delete_own
  ON public.reading_progress
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.reading_progress IS
  'Per-user reading position. Merge: chapter_id = max client_seq wins; scroll_position = MAX within same chapter.';
COMMENT ON COLUMN public.reading_progress.client_seq IS
  'Per-user monotonic sequence number from the client. Server rejects writes where client_seq decreases.';
