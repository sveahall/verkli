-- ---------------------------------------------------------------------------
-- DMCA + Age-gate scaffolding (Week 1 / ROADMAP Phase 0.3).
--
-- Three changes:
--   1. `content_reports.reason_code` allow 'dmca' alongside 'copyright'. DMCA
--      has a distinct legal-process flow (counter-notice, statutory
--      requirements) so we keep it separate from generic copyright reports.
--   2. `books.is_adult_content` flag (default false) — surfaced to the
--      author publish flow + reader age gate.
--   3. `profiles.age_verified_at` timestamp — set when a logged-in reader
--      passes the age gate; clients also persist a 30-day cookie/localStorage
--      shim for anonymous readers.
-- ---------------------------------------------------------------------------

-- 1. Allow 'dmca' on content_reports.reason_code -----------------------------
ALTER TABLE public.content_reports
  DROP CONSTRAINT IF EXISTS content_reports_reason_code_check;

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_reason_code_check CHECK (
    reason_code IN (
      'harassment',
      'spam',
      'hate_speech',
      'sexual_content',
      'copyright',
      'dmca',
      'illegal',
      'other'
    )
  );

-- 2. is_adult_content on books -----------------------------------------------
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS is_adult_content boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS books_adult_content_idx
  ON public.books (id) WHERE is_adult_content = true;

-- 3. age_verified_at on profiles ---------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_verified_at timestamptz;

-- rollback:
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS age_verified_at;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS is_adult_content;
--   ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_reason_code_check;
--   ALTER TABLE public.content_reports
--     ADD CONSTRAINT content_reports_reason_code_check CHECK (
--       reason_code IN ('harassment','spam','hate_speech','sexual_content','copyright','illegal','other')
--     );
