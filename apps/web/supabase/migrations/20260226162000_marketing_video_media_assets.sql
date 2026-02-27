-- Marketing Phase 1 video generation assets (Higgsfield image-to-video).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_asset_status') THEN
    CREATE TYPE public.media_asset_status AS ENUM ('draft', 'generating', 'ready', 'failed');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_provider') THEN
    CREATE TYPE public.media_provider AS ENUM ('higgsfield');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'video',
  status public.media_asset_status NOT NULL DEFAULT 'draft',
  provider public.media_provider NOT NULL DEFAULT 'higgsfield',
  provider_request_id text,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_url text,
  duration_seconds int NOT NULL DEFAULT 5,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_user_id_idx ON public.media_assets(user_id);
CREATE INDEX IF NOT EXISTS media_assets_book_id_idx ON public.media_assets(book_id);

DROP TRIGGER IF EXISTS update_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER update_media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_assets_select_own ON public.media_assets;
CREATE POLICY media_assets_select_own ON public.media_assets
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS media_assets_insert_own ON public.media_assets;
CREATE POLICY media_assets_insert_own ON public.media_assets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS media_assets_update_own ON public.media_assets;
CREATE POLICY media_assets_update_own ON public.media_assets
  FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS media_assets_delete_own ON public.media_assets;
CREATE POLICY media_assets_delete_own ON public.media_assets
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.media_assets IS 'Marketing media assets generated from providers (Phase 1: Higgsfield video).';
