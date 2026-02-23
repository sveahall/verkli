-- TTS Preview Lab: jobs table for internal Qwen TTS preview (worker polls, no Redis).
-- RLS: creator can read own; admin (profiles.role='admin') can read all.

CREATE TABLE IF NOT EXISTS public.tts_preview_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'author' CHECK (role IN ('author', 'reader')),
  text text NOT NULL,
  voice_id text NOT NULL DEFAULT 'Ryan',
  speed numeric,
  seed integer,
  format text NOT NULL DEFAULT 'wav' CHECK (format IN ('wav', 'mp3')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  progress integer NOT NULL DEFAULT 0,
  audio_path text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tts_preview_jobs_user_id_created_idx
  ON public.tts_preview_jobs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tts_preview_jobs_status_created_idx
  ON public.tts_preview_jobs(status, created_at ASC)
  WHERE status = 'queued';

DROP TRIGGER IF EXISTS update_tts_preview_jobs_updated_at ON public.tts_preview_jobs;
CREATE TRIGGER update_tts_preview_jobs_updated_at
  BEFORE UPDATE ON public.tts_preview_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.tts_preview_jobs ENABLE ROW LEVEL SECURITY;

-- Creator can read own; admin (profiles.role='admin') can read all when that role exists
DROP POLICY IF EXISTS tts_preview_jobs_select_own ON public.tts_preview_jobs;
CREATE POLICY tts_preview_jobs_select_own ON public.tts_preview_jobs
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND lower(trim(p.role)) = 'admin'
    )
  );

-- Creator can insert own
DROP POLICY IF EXISTS tts_preview_jobs_insert_own ON public.tts_preview_jobs;
CREATE POLICY tts_preview_jobs_insert_own ON public.tts_preview_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Worker uses service role; no UPDATE policy for user. Admin can update for triage if needed.
-- For worker: service role bypasses RLS.

COMMENT ON TABLE public.tts_preview_jobs IS 'TTS Lab: Qwen preview jobs. Worker polls queued, runs inference, stores audio in tts_previews bucket.';

-- Storage bucket for TTS previews (private, signed URLs only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tts_previews',
  'tts_previews',
  false,
  10485760,
  ARRAY['audio/wav', 'audio/mpeg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage: authenticated users can read their own (path: userId/jobId.ext)
DROP POLICY IF EXISTS storage_tts_previews_select_owner ON storage.objects;
CREATE POLICY storage_tts_previews_select_owner ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'tts_previews'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Worker uses service role (bypasses RLS) for INSERT. No permissive INSERT policy for users.
