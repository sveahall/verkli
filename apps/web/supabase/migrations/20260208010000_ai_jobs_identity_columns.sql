-- PR1: ai_jobs identity/progress columns for faster lookups and consistent status tracking.
-- Adds: book_id, book_version_id, language, progress
-- Includes trigger-based derivation for new writes, one-time backfill for existing rows, and indexing.

ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS book_id uuid,
  ADD COLUMN IF NOT EXISTS book_version_id uuid,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS progress smallint;

ALTER TABLE public.ai_jobs
  ALTER COLUMN progress SET DEFAULT 0;

ALTER TABLE public.ai_jobs
  DROP CONSTRAINT IF EXISTS ai_jobs_progress_check;

ALTER TABLE public.ai_jobs
  ADD CONSTRAINT ai_jobs_progress_check
  CHECK (progress >= 0 AND progress <= 100);

CREATE OR REPLACE FUNCTION public.ai_jobs_sync_derived_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_chapters integer;
  completed_chapters integer;
BEGIN
  -- Derive identifiers from input payload when explicit columns are missing.
  IF NEW.book_id IS NULL
     AND jsonb_typeof(NEW.input) = 'object'
     AND (NEW.input ->> 'bookId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    NEW.book_id := (NEW.input ->> 'bookId')::uuid;
  END IF;

  IF NEW.book_version_id IS NULL
     AND jsonb_typeof(NEW.input) = 'object'
     AND (NEW.input ->> 'bookVersionId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    NEW.book_version_id := (NEW.input ->> 'bookVersionId')::uuid;
  END IF;

  IF (NEW.language IS NULL OR btrim(NEW.language) = '')
     AND jsonb_typeof(NEW.input) = 'object'
  THEN
    NEW.language := NULLIF(btrim(NEW.input ->> 'language'), '');
  END IF;

  -- Normalize progress into [0,100]. Prefer explicit value, then derive from status/output.
  IF NEW.progress IS NULL THEN
    IF NEW.status = 'completed' THEN
      NEW.progress := 100;
    ELSIF NEW.status IN ('failed', 'cancelled') THEN
      NEW.progress := 0;
    ELSIF NEW.status = 'processing'
          AND jsonb_typeof(NEW.output) = 'object'
          AND (NEW.output ->> 'totalChapters') ~ '^[0-9]+$'
          AND (NEW.output ->> 'totalChapters')::int > 0
    THEN
      total_chapters := (NEW.output ->> 'totalChapters')::int;
      completed_chapters := CASE
        WHEN (NEW.output ->> 'completedChapters') ~ '^[0-9]+$'
          THEN (NEW.output ->> 'completedChapters')::int
        ELSE 0
      END;
      NEW.progress := ((completed_chapters * 100) / total_chapters)::smallint;
    ELSE
      NEW.progress := 0;
    END IF;
  END IF;

  NEW.progress := LEAST(100, GREATEST(0, NEW.progress))::smallint;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_jobs_sync_derived_fields ON public.ai_jobs;
CREATE TRIGGER ai_jobs_sync_derived_fields
BEFORE INSERT OR UPDATE OF input, output, status, book_id, book_version_id, language, progress
ON public.ai_jobs
FOR EACH ROW
EXECUTE FUNCTION public.ai_jobs_sync_derived_fields();

-- Backfill existing rows via trigger logic.
UPDATE public.ai_jobs
SET
  input = input,
  output = output,
  status = status
WHERE
  book_id IS NULL
  OR book_version_id IS NULL
  OR language IS NULL
  OR progress IS NULL
  OR progress < 0
  OR progress > 100;

-- Enforce non-null progress after backfill.
UPDATE public.ai_jobs
SET progress = 0
WHERE progress IS NULL;

ALTER TABLE public.ai_jobs
  ALTER COLUMN progress SET NOT NULL;

CREATE INDEX IF NOT EXISTS ai_jobs_kind_user_book_created_idx
  ON public.ai_jobs(kind, user_id, book_id, created_at DESC)
  WHERE book_id IS NOT NULL;

COMMENT ON COLUMN public.ai_jobs.book_id IS
  'Logical book identifier for jobs linked to a specific book.';
COMMENT ON COLUMN public.ai_jobs.book_version_id IS
  'Logical book_version identifier for jobs tied to a specific language/version.';
COMMENT ON COLUMN public.ai_jobs.language IS
  'Language code for the job payload/result (for example sv, en).';
COMMENT ON COLUMN public.ai_jobs.progress IS
  'Normalized progress percentage in range 0..100.';
