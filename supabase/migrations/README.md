# NOT the canonical migration path

This directory is **not** the canonical Supabase migrations directory for the
project. The active Supabase project config (`apps/web/supabase/config.toml`)
points at `apps/web/supabase/migrations/`, and that is where all new
migrations belong.

Files placed here will not be applied by:

- `supabase db push`
- `supabase db reset`
- the project's CI migration pipeline

## If you found a migration here

Either:

1. **Move it** to `apps/web/supabase/migrations/` (preserve the timestamp
   prefix so ordering is consistent), and replace the file in this directory
   with a stub that contains a `MOVED:` header pointing at the canonical
   copy. Keep the stub — deleting it loses git history of the move.
2. **Delete it** only after confirming the migration is not production-
   required (no production tables / functions / policies depend on it).

## Why two directories exist

Earlier in the project, `packages/db/supabase/migrations/` and
`/supabase/migrations/` both held canonical files. They were consolidated
into `apps/web/supabase/migrations/` (see
`20260304000000_consolidate_foundation_from_packages_db.sql`). This
directory is the residue.
