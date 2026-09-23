-- MOVED: This migration has been relocated to the canonical migration path.
--
-- Canonical location:
--   apps/web/supabase/migrations/20260408100000_author_subscriptions.sql
--
-- Why: apps/web/supabase/config.toml is the active Supabase project config in
-- this repo. Migrations under /supabase/migrations at the repo root are NOT
-- picked up by `supabase db push` / `supabase db reset` and were drifting
-- from the canonical set. This file is intentionally left as a no-op stub so
-- existing tooling that scans the directory will not error and so git
-- history points at the move. Apply changes only at the canonical path.
--
-- All statements below are no-ops; the canonical file is idempotent and
-- carries the live schema.

DO $$ BEGIN PERFORM 1; END $$;
