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

-- ─────────────────────────────────────────────────────────────
-- Recreate job_status_view to use identity columns + security_invoker.
-- security_invoker = on makes the view respect RLS of underlying tables,
-- so each user only sees their own jobs.
-- ─────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.job_status_view;
CREATE VIEW public.job_status_view
WITH (security_invoker = on) AS

-- Import jobs (from book_imports)
SELECT
  bi.id,
  bi.book_id,
  COALESCE(b.language, b.original_language, 'und') AS language_code,
  bi.author_id AS user_id,
  'import'::text AS kind,
  CASE bi.status
    WHEN 'pending'    THEN 'pending'
    WHEN 'extracting' THEN 'processing'
    WHEN 'completed'  THEN 'completed'
    WHEN 'failed'     THEN 'failed'
    ELSE 'pending'
  END AS status,
  bi.progress::smallint AS progress,
  jsonb_build_object(
    'fileName',      bi.file_name,
    'bookVersionId', bi.book_version_id
  ) AS detail,
  bi.error_message AS error,
  bi.created_at,
  NULL::timestamptz AS started_at,
  CASE WHEN bi.status IN ('completed', 'failed')
    THEN bi.updated_at
    ELSE NULL::timestamptz
  END AS finished_at
FROM public.book_imports bi
JOIN public.books b ON b.id = bi.book_id

UNION ALL

-- Translation jobs (from book_versions with active/completed/failed status)
SELECT
  bv.id,
  bv.book_id,
  bv.language_code,
  b.author_id AS user_id,
  'translation'::text AS kind,
  CASE bv.status
    WHEN 'translating' THEN 'processing'
    WHEN 'done'        THEN 'completed'
    WHEN 'failed'      THEN 'failed'
    ELSE 'pending'
  END AS status,
  CASE bv.status
    WHEN 'done'        THEN 100::smallint
    WHEN 'failed'      THEN 0::smallint
    WHEN 'translating' THEN 50::smallint
    ELSE 0::smallint
  END AS progress,
  jsonb_build_object(
    'bookVersionId', bv.id,
    'languageCode',  bv.language_code
  ) AS detail,
  NULL::text AS error,
  bv.created_at,
  CASE WHEN bv.status = 'translating'
    THEN bv.updated_at
    ELSE NULL::timestamptz
  END AS started_at,
  CASE WHEN bv.status IN ('done', 'failed')
    THEN bv.updated_at
    ELSE NULL::timestamptz
  END AS finished_at
FROM public.book_versions bv
JOIN public.books b ON b.id = bv.book_id
WHERE bv.status IN ('translating', 'done', 'failed')

UNION ALL

-- Audiobook jobs (from ai_jobs, using identity columns with JSONB fallback)
SELECT
  aj.id,
  COALESCE(aj.book_id, (aj.input ->> 'bookId')::uuid) AS book_id,
  COALESCE(aj.language, aj.input ->> 'language', 'und') AS language_code,
  aj.user_id,
  'audiobook'::text AS kind,
  CASE aj.status
    WHEN 'pending'    THEN 'pending'
    WHEN 'processing' THEN 'processing'
    WHEN 'completed'  THEN 'completed'
    WHEN 'failed'     THEN 'failed'
    ELSE 'pending'
  END AS status,
  CASE
    WHEN aj.progress > 0 THEN aj.progress::smallint
    WHEN aj.status = 'completed' THEN 100::smallint
    WHEN aj.status = 'failed' THEN 0::smallint
    WHEN aj.status = 'processing'
      AND (aj.output ->> 'totalChapters')::int > 0
      THEN LEAST(
        99,
        ((aj.output ->> 'completedChapters')::int * 100)
          / (aj.output ->> 'totalChapters')::int
      )::smallint
    ELSE 0::smallint
  END AS progress,
  COALESCE(aj.output, '{}'::jsonb) AS detail,
  aj.error,
  aj.created_at,
  aj.started_at,
  aj.finished_at
FROM public.ai_jobs aj
WHERE aj.kind = 'audiobook_generation'
  AND COALESCE(aj.book_id, (aj.input ->> 'bookId')::uuid) IS NOT NULL;

COMMENT ON VIEW public.job_status_view IS
  'Read-only unified view of all async jobs (import, translation, audiobook) per book. '
  'Status is normalized to: pending | processing | completed | failed. '
  'Uses security_invoker=on so RLS on underlying tables is enforced.';
