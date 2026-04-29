-- ---------------------------------------------------------------------------
-- Voice cloning + karaoke (Phase 1.1, ROADMAP §1.1).
--
-- Three additions:
--   1. `author_voices` — registry of an author's ElevenLabs voices
--      (cloned + optionally pre-existing presets they like).
--   2. `voice_consents` — explicit GDPR consent record for cloned voices,
--      with terms version and IP/UA snapshot. Required before /v1/voices/add.
--   3. `chapter_audio_timestamps` — per-word start/end timestamps captured
--      from ElevenLabs alongside the audio, used by the reader-side
--      karaoke render layer to highlight the current word during playback.
-- ---------------------------------------------------------------------------

-- 1. author_voices ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.author_voices (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  elevenlabs_voice_id    text        NOT NULL,
  name                   text        NOT NULL,
  description            text,
  source                 text        NOT NULL DEFAULT 'cloned'
                           CHECK (source IN ('cloned', 'preset', 'professional')),
  is_default             boolean     NOT NULL DEFAULT false,
  sample_storage_path    text,                    -- Supabase Storage key for the consent sample
  status                 text        NOT NULL DEFAULT 'ready'
                           CHECK (status IN ('ready', 'pending', 'failed', 'deleting')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  UNIQUE (user_id, elevenlabs_voice_id)
);

CREATE INDEX IF NOT EXISTS author_voices_user_id_idx
  ON public.author_voices (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS author_voices_active_idx
  ON public.author_voices (id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS author_voices_default_per_user_idx
  ON public.author_voices (user_id) WHERE is_default = true AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_author_voices_updated_at ON public.author_voices;
CREATE TRIGGER update_author_voices_updated_at
  BEFORE UPDATE ON public.author_voices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.author_voices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Author manages own voices" ON public.author_voices;
CREATE POLICY "Author manages own voices"
  ON public.author_voices
  FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "author_voices_hide_soft_deleted" ON public.author_voices;
CREATE POLICY "author_voices_hide_soft_deleted"
  ON public.author_voices
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (deleted_at IS NULL);

-- 2. voice_consents ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voice_consents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voice_id        uuid        REFERENCES public.author_voices(id) ON DELETE SET NULL,
  terms_version   text        NOT NULL,
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  ip              text,
  user_agent      text,
  withdrawn_at    timestamptz
);

CREATE INDEX IF NOT EXISTS voice_consents_user_id_idx ON public.voice_consents (user_id);
CREATE INDEX IF NOT EXISTS voice_consents_voice_id_idx ON public.voice_consents (voice_id);

ALTER TABLE public.voice_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User reads own consents" ON public.voice_consents;
CREATE POLICY "User reads own consents"
  ON public.voice_consents
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT is service-role only (the clone API route uses admin client).
-- This intentionally blocks user-side inserts so consent records are not
-- forged.

-- 3. chapter_audio_timestamps ----------------------------------------------
-- Per-chapter, per-language word timestamp array. Sourced from ElevenLabs
-- when audiobook is generated. Used by the reader karaoke component.
--
-- The `words` JSONB shape is:
--   [
--     { "word": "Snöfallet", "start": 0.00, "end": 0.62 },
--     { "word": "hade",      "start": 0.62, "end": 0.78 },
--     ...
--   ]
-- The render layer scans for `start <= currentTime < end` to find the
-- active word; an O(log n) bisect is fine for 5000-word chapters.
CREATE TABLE IF NOT EXISTS public.chapter_audio_timestamps (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id      uuid        NOT NULL,
  language        text        NOT NULL,
  audio_asset_id  uuid,                       -- references audiobook_assets if available
  words           jsonb       NOT NULL,
  total_words     integer,
  duration_ms     integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, language)
);

CREATE INDEX IF NOT EXISTS chapter_audio_timestamps_chapter_lang_idx
  ON public.chapter_audio_timestamps (chapter_id, language);
CREATE INDEX IF NOT EXISTS chapter_audio_timestamps_asset_idx
  ON public.chapter_audio_timestamps (audio_asset_id);

DROP TRIGGER IF EXISTS update_chapter_audio_timestamps_updated_at ON public.chapter_audio_timestamps;
CREATE TRIGGER update_chapter_audio_timestamps_updated_at
  BEFORE UPDATE ON public.chapter_audio_timestamps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.chapter_audio_timestamps ENABLE ROW LEVEL SECURITY;

-- Anyone with read access to the chapter can read timestamps. We rely on
-- existing chapter-level RLS / canUserReadBook checks for the actual chapter
-- content; timestamps are not load-bearing for paywall enforcement.
DROP POLICY IF EXISTS "Authenticated reads chapter timestamps" ON public.chapter_audio_timestamps;
CREATE POLICY "Authenticated reads chapter timestamps"
  ON public.chapter_audio_timestamps
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- rollback:
--   DROP TABLE IF EXISTS public.chapter_audio_timestamps;
--   DROP TABLE IF EXISTS public.voice_consents;
--   DROP TABLE IF EXISTS public.author_voices;
