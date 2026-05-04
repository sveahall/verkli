-- Investor pitch demo facade — schema additions.
--
-- Adds demo-only columns to existing tables so the seed script can mark a
-- protected demo author + book and the runtime façade can reset state per
-- demo run. All statements are IF NOT EXISTS / IF EXISTS so safe to apply
-- repeatedly.
--
-- Notes on naming:
--   - The plan refers to "users.demo_mode" / "users.is_protected" — in this
--     codebase the per-user metadata table is `public.profiles` (auth.users
--     is managed by Supabase). These flags therefore live on `profiles`.
--   - The plan refers to "chapter_translations" — there is no such table.
--     Translation tracking lives on `public.book_translations`. That is the
--     table that gets `demo_run_id`. Translation content itself lives in
--     `chapters` linked through `book_versions`.

-- ─────────────────────────────────────────────────────────────
-- profiles: demo_mode + is_protected
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS demo_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.demo_mode IS
  'When true, this profile is the investor-pitch demo account. Triggers facade behavior in the UI when demo_facade flag is on.';
COMMENT ON COLUMN public.profiles.is_protected IS
  'When true, this profile and its books must not be deleted/edited by routine cleanup or admin actions. Used by the demo seed.';

CREATE INDEX IF NOT EXISTS profiles_demo_mode_idx
  ON public.profiles (demo_mode)
  WHERE demo_mode = true;

-- ─────────────────────────────────────────────────────────────
-- books: demo_pod_enabled + demo_run_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS demo_pod_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS demo_run_id uuid;

COMMENT ON COLUMN public.books.demo_pod_enabled IS
  'Print-on-demand mock toggle for the demo. Real POD integration ignores this column.';
COMMENT ON COLUMN public.books.demo_run_id IS
  'Tags this row as belonging to a specific demo seed run. NULL for non-demo books.';

CREATE INDEX IF NOT EXISTS books_demo_run_id_idx
  ON public.books (demo_run_id)
  WHERE demo_run_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- book_versions: demo_run_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.book_versions
  ADD COLUMN IF NOT EXISTS demo_run_id uuid;

COMMENT ON COLUMN public.book_versions.demo_run_id IS
  'Tags this version row as belonging to a specific demo seed run.';

CREATE INDEX IF NOT EXISTS book_versions_demo_run_id_idx
  ON public.book_versions (demo_run_id)
  WHERE demo_run_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- book_translations: demo_run_id
-- (Translation tracking table; the "chapter_translations" name in the plan
-- maps to this in our schema.)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.book_translations
  ADD COLUMN IF NOT EXISTS demo_run_id uuid;

COMMENT ON COLUMN public.book_translations.demo_run_id IS
  'Tags this translation tracking row as belonging to a specific demo seed run.';

CREATE INDEX IF NOT EXISTS book_translations_demo_run_id_idx
  ON public.book_translations (demo_run_id)
  WHERE demo_run_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- audiobook_assets: demo_run_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.audiobook_assets
  ADD COLUMN IF NOT EXISTS demo_run_id uuid;

COMMENT ON COLUMN public.audiobook_assets.demo_run_id IS
  'Tags this audiobook asset as belonging to a specific demo seed run.';

CREATE INDEX IF NOT EXISTS audiobook_assets_demo_run_id_idx
  ON public.audiobook_assets (demo_run_id)
  WHERE demo_run_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- marketing_campaigns: demo_run_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS demo_run_id uuid;

COMMENT ON COLUMN public.marketing_campaigns.demo_run_id IS
  'Tags this marketing campaign row as belonging to a specific demo seed run.';

CREATE INDEX IF NOT EXISTS marketing_campaigns_demo_run_id_idx
  ON public.marketing_campaigns (demo_run_id)
  WHERE demo_run_id IS NOT NULL;
