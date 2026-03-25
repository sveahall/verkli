# SCHEMA_GAPS

## Status
The runtime objects that previously appeared missing are now represented in
`apps/web/supabase/migrations`.

There is no open repo/runtime drift remaining for the tables listed below; this
document is now a reconciliation record rather than an active gap list.

Canonical creation lives in:
- `20260219130000_missing_tables_billing_social_recs_genres.sql`

Replay-safe reconciliation lives in:
- `20260322000000_missing_tables_genres_social_recommendations.sql`

## Objects Covered
- `social_connections`
- `social_connections_safe`
- `genres`
- `book_genres`
- `reader_genre_preferences`
- `reader_book_signals`
- `recommendations`

## What Was Added Or Reconciled
- `social_connections` plus the safe projection view `social_connections_safe`
- `genres` with the runtime-required `name`, `name_sv`, `name_en`, `icon`, and `display_order`
- `book_genres` indexes used by cover generation, discovery, and recommendations
- `reader_genre_preferences.weight`
- `reader_book_signals` indexes used by onboarding and recommendation jobs
- `recommendations.reason`, `recommendations.batch_id`, and `recommendations.created_at`

## Important Note
The later March migration originally duplicated object creation and could break a
clean migration replay. It now acts as a reconciliation migration only, so the
migration chain is safe to apply from scratch while still converging existing
databases on the runtime schema.
