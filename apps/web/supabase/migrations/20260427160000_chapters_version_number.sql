-- chapters.version_number: optimistic-concurrency token for the editor.
--
-- The editor needs a way to detect "the chapter changed under me" so a stale
-- write does not silently overwrite a peer save. Pattern: client reads the
-- chapter, sees version_number = N, and re-saves with an If-Match-style
-- predicate (`UPDATE ... WHERE id = ? AND version_number = N`). If the row
-- has moved on, zero rows match and the client knows to refresh.
--
-- Server-side bump is handled by a BEFORE UPDATE trigger so application code
-- cannot accidentally skip it. The trigger only bumps when the user-visible
-- columns (content, title, "order") actually change — pure metadata churn
-- (e.g. updated_at refresh, content_hash recompute) does NOT invalidate
-- outstanding If-Match tokens.

-- Idempotent column add. Default 0 so existing rows have a known starting
-- version after backfill; new rows also start at 0 and bump to 1 on first
-- meaningful update.
ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 0;

-- Bumper function. Runs in the row's BEFORE UPDATE phase so the new value is
-- written as part of the same UPDATE — no second round-trip.
CREATE OR REPLACE FUNCTION public.bump_chapters_version_number()
RETURNS trigger AS $$
BEGIN
  -- IS DISTINCT FROM treats NULLs symmetrically (so NULL→NULL is not a
  -- change). content/title/"order" are the editor-visible fields.
  IF (NEW.content      IS DISTINCT FROM OLD.content)
     OR (NEW.title     IS DISTINCT FROM OLD.title)
     OR (NEW."order"   IS DISTINCT FROM OLD."order") THEN
    NEW.version_number := COALESCE(OLD.version_number, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bump_chapters_version_number_trg ON public.chapters;
CREATE TRIGGER bump_chapters_version_number_trg
  BEFORE UPDATE ON public.chapters
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_chapters_version_number();

COMMENT ON COLUMN public.chapters.version_number IS
  'Monotonic editor concurrency token. Bumped by trigger when content/title/order changes. Used for If-Match-style stale-write detection.';
