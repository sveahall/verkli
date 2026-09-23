-- Offline reading for Plus members
-- Stores per-user offline manifest snapshots keyed by book version.

CREATE TABLE IF NOT EXISTS public.offline_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  book_version_id uuid NOT NULL REFERENCES public.book_versions(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  manifest_hash text NOT NULL,
  chapter_count integer NOT NULL DEFAULT 0 CHECK (chapter_count >= 0),
  chapter_hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  chapter_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  book_url text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id, book_version_id)
);

CREATE INDEX IF NOT EXISTS offline_manifests_user_id_idx
  ON public.offline_manifests(user_id);

CREATE INDEX IF NOT EXISTS offline_manifests_book_id_idx
  ON public.offline_manifests(book_id);

CREATE INDEX IF NOT EXISTS offline_manifests_book_version_id_idx
  ON public.offline_manifests(book_version_id);

DROP TRIGGER IF EXISTS update_offline_manifests_updated_at ON public.offline_manifests;
CREATE TRIGGER update_offline_manifests_updated_at
  BEFORE UPDATE ON public.offline_manifests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.offline_manifests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offline_manifests_select_own ON public.offline_manifests;
CREATE POLICY offline_manifests_select_own ON public.offline_manifests
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS offline_manifests_insert_own ON public.offline_manifests;
CREATE POLICY offline_manifests_insert_own ON public.offline_manifests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS offline_manifests_update_own ON public.offline_manifests;
CREATE POLICY offline_manifests_update_own ON public.offline_manifests
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS offline_manifests_delete_own ON public.offline_manifests;
CREATE POLICY offline_manifests_delete_own ON public.offline_manifests
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.offline_manifests IS
  'Per-user offline manifest snapshot for a specific book version, including chapter content hashes for cache invalidation.';
