-- PR1: Minimal ai_jobs identity columns migration
-- Adds columns, backfills existing rows, and creates index for book job lookups.

ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS book_version_id uuid REFERENCES public.book_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;

UPDATE public.ai_jobs
SET book_id = (input ->> 'bookId')::uuid
WHERE book_id IS NULL
  AND input IS NOT NULL
  AND (input ->> 'bookId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.ai_jobs
SET book_version_id = (input ->> 'bookVersionId')::uuid
WHERE book_version_id IS NULL
  AND input IS NOT NULL
  AND (input ->> 'bookVersionId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE public.ai_jobs
SET language = NULLIF(btrim(input ->> 'language'), '')
WHERE (language IS NULL OR btrim(language) = '')
  AND input IS NOT NULL
  AND NULLIF(btrim(input ->> 'language'), '') IS NOT NULL;

UPDATE public.ai_jobs
SET progress = 100
WHERE status = 'completed'
  AND progress < 100;

UPDATE public.ai_jobs
SET progress = LEAST(
  99,
  GREATEST(
    0,
    ((COALESCE((output ->> 'completedChapters')::int, 0) * 100) / (output ->> 'totalChapters')::int
    )
  )
)
WHERE status = 'processing'
  AND output IS NOT NULL
  AND (output ->> 'totalChapters') ~ '^[0-9]+$'
  AND (output ->> 'totalChapters')::int > 0;

UPDATE public.ai_jobs
SET progress = 0
WHERE status IN ('failed', 'cancelled')
  AND progress < 0;

CREATE INDEX IF NOT EXISTS ai_jobs_book_id_created_idx
  ON public.ai_jobs (book_id, created_at DESC)
  WHERE book_id IS NOT NULL;
