# Investor pitch demo seed

`seed-investor-demo.ts` provisions the demo author and book "The Haunted Diary"
with 10 pre-baked language versions used by the investor pitch.

It is **idempotent** — running it twice produces the same row count. Each run
generates a fresh `demo_run_id` and stamps it onto every demo-owned row so the
runtime façade can reset state per rehearsal without coupling to wall time.

## Branch baseline

The active development line for this repo is **`mvp-wip-2026-03-18`**, not
`main` — `main` is hundreds of commits behind and missing most of the codebase
this script depends on (`scripts/`, `apps/web/supabase/migrations/*`,
`createAdminClient` and friends). All demo work branches off
`mvp-wip-2026-03-18`. Future sessions should do the same; branching off `main`
will silently lose context.

## Day 1 verification status

Idempotency on Day 1 was confirmed **by code review only** — every row write
either upserts on a UNIQUE constraint (`profiles.username`,
`book_versions(book_id, language_code)`, `book_translations(book_id, language)`)
or does an explicit lookup-then-update/insert (`books`, `chapters` keyed by
`book_version_id, order`). No `Date.now()` slugs. A live two-run row-count
verification against a real DB was not performed in Day 1 because no local
Supabase / Docker was available in the session. Run it as the first action on
Day 2 — see "Verifying idempotency" below.

## What gets created

- 1 protected author profile
  (`username = verkli-demo`, `demo_mode = true`, `is_protected = true`)
- 1 book `The Haunted Diary` (`slug = the-haunted-diary`, status `PUBLISHED`)
- 10 `book_versions` (1 SV original + 3 A-quality + 6 B-quality)
- 10 `chapters` (single-chapter demo, one per version)
- 9 `book_translations` tracking rows, all `status = completed`, `progress = 100`

Audiobook assets, marketing campaigns, social mocks, and POD modal data are
provisioned in subsequent days of the demo plan, not by this script.

## Prerequisites

- `apps/web/.env.local` with:
  - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
  - `SUPABASE_SERVICE_ROLE_KEY`
- The migration `20260504100000_investor_demo_facade.sql` applied to the target
  Supabase project.

## Safety guard

The script refuses to start unless the target Supabase URL is safe:

| Condition                                                      | Behaviour                       |
| -------------------------------------------------------------- | ------------------------------- |
| `SUPABASE_URL` missing                                         | abort                           |
| URL contains `prod` or `production` (case-insensitive)         | abort                           |
| URL is local (`localhost`, `127.0.0.1`, `0.0.0.0`, `*.local`)  | run                             |
| Otherwise (e.g. a Supabase Cloud staging project URL)          | run only with `DEMO_SEED_ALLOW_NONLOCAL=true` |

This is enforced at script startup, before any DB call.

## Running

```bash
# Local Supabase (default)
npx tsx apps/web/scripts/seed-investor-demo.ts

# Staging Supabase Cloud (after triple-checking the URL is NOT prod)
DEMO_SEED_ALLOW_NONLOCAL=true npx tsx apps/web/scripts/seed-investor-demo.ts
```

## Verifying idempotency

Run the script twice in a row and confirm row counts do not grow:

```bash
npx tsx apps/web/scripts/seed-investor-demo.ts
npx tsx apps/web/scripts/seed-investor-demo.ts

# Expected on each run:
#   versions touched:   10
#   chapters touched:   10
#   translation rows:   9
# After two runs, the underlying tables still hold exactly:
#   1 row in profiles where username='verkli-demo'
#   1 row in books where slug='the-haunted-diary'
#   10 rows in book_versions for that book
#   10 rows in chapters across those versions
#   9 rows in book_translations for that book
```

`demo_run_id` is the only column that changes between runs — it gets refreshed
to a new UUID on every row, which is the intended reset signal for the façade.

## Resetting state for a rehearsal

To rewind any UI cached against `demo_run_id`, simply re-run the seed. The
new `demo_run_id` invalidates whatever the façade had stored for the previous
rehearsal.

## Related files

- Migration: `apps/web/supabase/migrations/20260504100000_investor_demo_facade.sql`
- Translation source data: `apps/web/scripts/seed-data/haunted-diary.ts`
- Feature flag: `apps/web/src/lib/flags.ts` (`getDemoFacadeEnabled` / `isDemoFacadeEnabled`)
