-- Worker contract hardening: job tracking, RLS alignment, storage buckets, and audiobook status source-of-truth.

-- ─────────────────────────────────────────────────────────────
-- ai_jobs: create/normalize for worker job tracking
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  input jsonb,
  output jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS input jsonb,
  ADD COLUMN IF NOT EXISTS output jsonb,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.ai_jobs
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.ai_jobs
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.ai_jobs
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

UPDATE public.ai_jobs
SET status = 'failed'
WHERE status IS NULL
   OR status NOT IN ('pending', 'processing', 'completed', 'failed', 'cancelled');

ALTER TABLE public.ai_jobs
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.ai_jobs
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.ai_jobs
  DROP CONSTRAINT IF EXISTS ai_jobs_status_check;

ALTER TABLE public.ai_jobs
  ADD CONSTRAINT ai_jobs_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

CREATE INDEX IF NOT EXISTS ai_jobs_user_kind_created_idx
  ON public.ai_jobs(user_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_jobs_status_created_idx
  ON public.ai_jobs(status, created_at DESC);

DROP TRIGGER IF EXISTS update_ai_jobs_updated_at ON public.ai_jobs;
CREATE TRIGGER update_ai_jobs_updated_at
  BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_jobs_select_own ON public.ai_jobs;
CREATE POLICY ai_jobs_select_own ON public.ai_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_jobs_insert_own ON public.ai_jobs;
CREATE POLICY ai_jobs_insert_own ON public.ai_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_jobs_update_own ON public.ai_jobs;
CREATE POLICY ai_jobs_update_own ON public.ai_jobs
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_jobs_delete_own ON public.ai_jobs;
CREATE POLICY ai_jobs_delete_own ON public.ai_jobs
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.ai_jobs IS 'Generic worker job tracking table for import/translation/audiobook/tts flows.';
COMMENT ON COLUMN public.ai_jobs.kind IS 'Job kind (for example: import_extraction, translation, audiobook_generation, tts_generation).';
COMMENT ON COLUMN public.ai_jobs.status IS 'Lifecycle: pending -> processing -> completed | failed | cancelled.';

-- Tighten existing book_imports UPDATE policy to prevent ownership drift.
DROP POLICY IF EXISTS book_imports_update ON public.book_imports;
CREATE POLICY book_imports_update ON public.book_imports
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- ─────────────────────────────────────────────────────────────
-- Shared visibility helper for reader-facing checks
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_book(book_id uuid, viewer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.book_versions bv
    JOIN public.books b ON b.id = bv.book_id
    WHERE bv.book_id = book_id
      AND bv.published_at IS NOT NULL
      AND (
        bv.visibility = 'public'
        OR (
          bv.visibility = 'followers'
          AND viewer_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.author_followers f
            WHERE f.author_id = b.author_id
              AND f.follower_id = viewer_id
          )
        )
      )
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- audiobook_assets RLS aligned with can_view_book
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS audiobook_assets_select ON public.audiobook_assets;
CREATE POLICY audiobook_assets_select ON public.audiobook_assets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.books b
      WHERE b.id = audiobook_assets.book_id
        AND b.author_id = auth.uid()
    )
    OR public.can_view_book(audiobook_assets.book_id, auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- Audiobook status source-of-truth: generated assets => books.audiobook_status='published'
-- ─────────────────────────────────────────────────────────────
UPDATE public.books b
SET audiobook_status = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.audiobook_assets aa
    WHERE aa.book_id = b.id
      AND aa.status = 'generated'
  ) THEN 'published'
  WHEN b.audiobook_status = 'ready' THEN 'not_started'
  WHEN b.audiobook_status IS NULL THEN 'not_started'
  WHEN b.audiobook_status NOT IN ('not_started', 'generating', 'published', 'failed') THEN 'not_started'
  ELSE b.audiobook_status
END;

ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_audiobook_status_check;

ALTER TABLE public.books
  ADD CONSTRAINT books_audiobook_status_check
  CHECK (audiobook_status IN ('not_started', 'generating', 'published', 'failed'));

CREATE OR REPLACE FUNCTION public.refresh_book_audiobook_status(p_book_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  has_generated boolean;
BEGIN
  IF p_book_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.audiobook_assets aa
    WHERE aa.book_id = p_book_id
      AND aa.status = 'generated'
  ) INTO has_generated;

  IF has_generated THEN
    UPDATE public.books
    SET audiobook_status = 'published'
    WHERE id = p_book_id
      AND audiobook_status IS DISTINCT FROM 'published';
  ELSE
    UPDATE public.books
    SET audiobook_status = CASE
      WHEN audiobook_status = 'published' THEN 'not_started'
      WHEN audiobook_status IS NULL THEN 'not_started'
      ELSE audiobook_status
    END
    WHERE id = p_book_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_book_audiobook_status_from_assets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_book_audiobook_status(OLD.book_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_book_audiobook_status(NEW.book_id);

  IF TG_OP = 'UPDATE' AND OLD.book_id IS DISTINCT FROM NEW.book_id THEN
    PERFORM public.refresh_book_audiobook_status(OLD.book_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_book_audiobook_status_on_assets ON public.audiobook_assets;
CREATE TRIGGER sync_book_audiobook_status_on_assets
  AFTER INSERT OR UPDATE OR DELETE ON public.audiobook_assets
  FOR EACH ROW EXECUTE FUNCTION public.sync_book_audiobook_status_from_assets();

-- ─────────────────────────────────────────────────────────────
-- Storage buckets and policies
-- ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'book_covers',
    'book_covers',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
  ),
  (
    'audiobooks',
    'audiobooks',
    true,
    536870912,
    ARRAY['audio/wav', 'audio/mpeg', 'audio/mp4', 'application/json']::text[]
  ),
  (
    'tts-outputs',
    'tts-outputs',
    true,
    536870912,
    ARRAY['audio/wav', 'audio/mpeg', 'audio/mp4']::text[]
  )
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Skip ALTER on storage.objects: on hosted Supabase we are not owner; RLS is already enabled there.
-- On local Supabase, RLS is typically enabled by default for storage.

DROP POLICY IF EXISTS storage_book_covers_select_public ON storage.objects;
CREATE POLICY storage_book_covers_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id = 'book_covers');

DROP POLICY IF EXISTS storage_book_covers_insert_owner ON storage.objects;
CREATE POLICY storage_book_covers_insert_owner ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'book_covers'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS storage_book_covers_update_owner ON storage.objects;
CREATE POLICY storage_book_covers_update_owner ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'book_covers'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'book_covers'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS storage_book_covers_delete_owner ON storage.objects;
CREATE POLICY storage_book_covers_delete_owner ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'book_covers'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS storage_audio_outputs_select_public ON storage.objects;
CREATE POLICY storage_audio_outputs_select_public ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('audiobooks', 'tts-outputs'));
