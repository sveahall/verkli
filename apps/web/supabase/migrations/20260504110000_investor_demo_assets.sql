-- Investor pitch demo facade — Day 2 schema additions.
--
-- Adds:
--   - last_generated_at timestamptz on cached asset tables (audiobook_assets,
--     marketing_campaigns, book_versions). Used by the seed to honestly
--     assert "Generated just now" in the UI on every demo run.
--   - metadata jsonb on marketing_campaigns. The plan says "spegla i
--     marketing_campaigns.metadata" — the existing table had no metadata
--     column. We add one so the demo seed can store thumbnail/social-format
--     hints next to each row.
--   - 'youtube' allowed in marketing_campaigns.channel CHECK constraint, so
--     the YouTube Shorts native-format demo thumbnails can be inserted.
--
-- All statements are IF NOT EXISTS / IF EXISTS so this is safe to apply
-- repeatedly.

-- ─────────────────────────────────────────────────────────────
-- audiobook_assets: last_generated_at
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.audiobook_assets
  ADD COLUMN IF NOT EXISTS last_generated_at timestamptz;

COMMENT ON COLUMN public.audiobook_assets.last_generated_at IS
  'Timestamp of the most recent (re)generation. Refreshed by the demo seed on every run; used by the UI to say "Generated just now" honestly.';

CREATE INDEX IF NOT EXISTS audiobook_assets_last_generated_at_idx
  ON public.audiobook_assets (last_generated_at)
  WHERE last_generated_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- marketing_campaigns: metadata + last_generated_at + youtube channel
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS last_generated_at timestamptz;

COMMENT ON COLUMN public.marketing_campaigns.metadata IS
  'Free-form JSON for per-campaign metadata: thumbnail URL, native-format hint, demo flags.';
COMMENT ON COLUMN public.marketing_campaigns.last_generated_at IS
  'Timestamp of the most recent (re)generation. See audiobook_assets.last_generated_at.';

CREATE INDEX IF NOT EXISTS marketing_campaigns_last_generated_at_idx
  ON public.marketing_campaigns (last_generated_at)
  WHERE last_generated_at IS NOT NULL;

-- Replace the channel CHECK constraint to allow 'youtube'.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.marketing_campaigns'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%channel%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.marketing_campaigns DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_channel_check
    CHECK (channel IN ('generic', 'tiktok', 'instagram', 'x', 'youtube'));
END $$;

-- ─────────────────────────────────────────────────────────────
-- book_versions: last_generated_at
-- (Translations are cached assets too — same timestamp semantics.)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.book_versions
  ADD COLUMN IF NOT EXISTS last_generated_at timestamptz;

COMMENT ON COLUMN public.book_versions.last_generated_at IS
  'Timestamp of the most recent (re)generation of this language version.';
