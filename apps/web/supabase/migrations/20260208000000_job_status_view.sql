-- Unified read-only VIEW: normalizes job status from book_imports, book_versions, ai_jobs.
-- No new tables. Workers are unchanged. API reads this VIEW via GET /api/books/:id/jobs.

CREATE OR REPLACE VIEW public.job_status_view AS

-- Import jobs (from book_imports)
-- Note: book_imports.book_id can be NULL before the book is created;
-- the INNER JOIN on books excludes those rows intentionally.
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
-- draft versions are excluded since they represent no translation work.
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

-- Audiobook jobs (from ai_jobs where kind = 'audiobook_generation')
SELECT
  aj.id,
  (aj.input ->> 'bookId')::uuid AS book_id,
  COALESCE(aj.input ->> 'language', 'und') AS language_code,
  aj.user_id,
  'audiobook'::text AS kind,
  CASE aj.status
    WHEN 'pending'    THEN 'pending'
    WHEN 'processing' THEN 'processing'
    WHEN 'completed'  THEN 'completed'
    WHEN 'failed'     THEN 'failed'
    ELSE 'pending'
  END AS status,
  CASE aj.status
    WHEN 'completed' THEN 100::smallint
    WHEN 'failed'    THEN 0::smallint
    WHEN 'processing' THEN
      CASE
        WHEN (aj.output ->> 'totalChapters')::int > 0
        THEN LEAST(
          99,
          ((aj.output ->> 'completedChapters')::int * 100)
            / (aj.output ->> 'totalChapters')::int
        )::smallint
        ELSE 0::smallint
      END
    ELSE 0::smallint
  END AS progress,
  COALESCE(aj.output, '{}'::jsonb) AS detail,
  aj.error,
  aj.created_at,
  aj.started_at,
  aj.finished_at
FROM public.ai_jobs aj
WHERE aj.kind = 'audiobook_generation'
  AND aj.input ->> 'bookId' IS NOT NULL;

COMMENT ON VIEW public.job_status_view IS
  'Read-only unified view of all async jobs (import, translation, audiobook) per book. '
  'Status is normalized to: pending | processing | completed | failed.';
