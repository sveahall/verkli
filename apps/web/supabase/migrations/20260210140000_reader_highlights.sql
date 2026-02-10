-- Reader highlights with optional note/comment.
-- Stores text offsets per chapter + book version and enforces owner-only RLS.

CREATE TABLE IF NOT EXISTS public.highlights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  book_version_id uuid NOT NULL REFERENCES public.book_versions(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  start_offset integer NOT NULL CHECK (start_offset >= 0),
  end_offset integer NOT NULL CHECK (end_offset > start_offset),
  snippet text NOT NULL,
  color text NOT NULL DEFAULT 'yellow',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS highlights_user_chapter_offsets_key
  ON public.highlights(user_id, chapter_id, start_offset, end_offset);
CREATE INDEX IF NOT EXISTS highlights_user_id_idx ON public.highlights(user_id);
CREATE INDEX IF NOT EXISTS highlights_book_version_id_idx ON public.highlights(book_version_id);
CREATE INDEX IF NOT EXISTS highlights_chapter_id_idx ON public.highlights(chapter_id);

DROP TRIGGER IF EXISTS update_highlights_updated_at ON public.highlights;
CREATE TRIGGER update_highlights_updated_at
  BEFORE UPDATE ON public.highlights
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS highlights_select_own ON public.highlights;
CREATE POLICY highlights_select_own ON public.highlights
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS highlights_insert_own ON public.highlights;
CREATE POLICY highlights_insert_own ON public.highlights
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS highlights_update_own ON public.highlights;
CREATE POLICY highlights_update_own ON public.highlights
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS highlights_delete_own ON public.highlights;
CREATE POLICY highlights_delete_own ON public.highlights
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.highlights IS 'Reader highlights with optional note, scoped per user/book version/chapter.';
