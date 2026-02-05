-- Chapter audio cache for idempotent audiobook generation
-- Uses existing ai_jobs table for job tracking (kind='audiobook_generation')

-- ─────────────────────────────────────────────────────────────────────────────
-- chapter_audio_cache: caches synthesized chapter audio
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chapter_audio_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Chapter reference (no FK to avoid issues with version changes)
  chapter_id uuid NOT NULL,
  book_version_id uuid,

  -- Cache key components (all must match for cache hit)
  content_hash text NOT NULL,
  voice_id text NOT NULL,
  model_path text NOT NULL,
  language text NOT NULL,

  -- Cached audio location and metadata
  audio_path text NOT NULL,
  duration_seconds integer,
  file_size_bytes bigint,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one cache entry per content+voice+model+language combo
CREATE UNIQUE INDEX IF NOT EXISTS chapter_audio_cache_unique_idx
  ON public.chapter_audio_cache(chapter_id, content_hash, voice_id, model_path, language);

-- Fast lookup by chapter
CREATE INDEX IF NOT EXISTS chapter_audio_cache_chapter_id_idx
  ON public.chapter_audio_cache(chapter_id);

COMMENT ON TABLE public.chapter_audio_cache IS
  'Caches TTS output per chapter+voice+model combination for idempotent audiobook regeneration';

-- RLS: book owner can read their chapter cache
ALTER TABLE public.chapter_audio_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chapter_audio_cache_select ON public.chapter_audio_cache;
CREATE POLICY chapter_audio_cache_select ON public.chapter_audio_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.chapters c
      JOIN public.books b ON b.id = c.book_id
      WHERE c.id = chapter_audio_cache.chapter_id
      AND b.author_id = auth.uid()
    )
  );

-- Insert/update/delete via service role only (worker uses admin client)
-- No additional policies needed - admin client bypasses RLS
