# Archived Migrations

These migrations were the original foundational schemas from `packages/db`.
They have been consolidated into the canonical migration directory:

**Canonical location:** `apps/web/supabase/migrations/`

## What happened

As of 2026-03-04, all migrations were unified under `apps/web/supabase/migrations/`.
The foundational schemas from this directory (users trigger, shelves, profiles,
newsletters, readings RLS) were ported into a single idempotent migration:

`apps/web/supabase/migrations/20260304000000_consolidate_foundation_from_packages_db.sql`

## Migration mapping

| Archived file | Status in apps/web |
|---|---|
| 00001_create_users_trigger.sql | Ported to 20260304000000 |
| 00002_rls_policies.sql | Books/chapters/reviews already covered; readings RLS ported to 20260304000000 |
| 00003_create_shelves.sql | Ported to 20260304000000 |
| 00004_add_shelf_fields.sql | Merged into shelves definition in 20260304000000 |
| 00004_create_profiles.sql | Ported to 20260304000000 |
| 00006_fix_chapters_rls.sql | Superseded by 20260203000000_book_versions.sql |
| 00007_notifications.sql | Superseded by 20260211_notifications.sql |
| 00008_book_clubs.sql | Superseded by 20260211300000_book_clubs.sql |
| 00009_polls.sql | Superseded by 20260211300001_polls.sql |
| 00010_newsletters.sql | Ported to 20260304000000 |
| 00011_user_usage_monthly.sql | Was already a marker pointing to apps/web |

## Do not modify these files

These are kept for reference only. All future migrations go in `apps/web/supabase/migrations/`.
