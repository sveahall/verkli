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
- 10 `audiobook_assets` rows (one per language) pointing at
  `/demo-assets/audio/<lang>.mp3`
- 12 `marketing_campaigns` rows: 3 languages (`sv`, `en`, `fr`) × 4 channels
  (`tiktok`, `instagram`, `x`, `youtube`), each with localized headline /
  caption / cta / hashtags and `metadata.thumbnail_url` pointing at
  `/demo-assets/social/<lang>-<channel>.svg`. The Distribution-façaden in
  the demo only renders these 3 languages — keep `MARKETING_LANGUAGES`
  in `seed-investor-demo.ts` in sync if the UI changes.

The seed also runs a `delete-stale` step against `marketing_campaigns` for
the demo book, removing any rows whose `demo_run_id` does not match the
current run. This prevents a wider language/channel set from a previous
seed iteration from sticking around silently.

If `apps/web/public/demo-assets/trailer.mp4` exists on disk (produced by
`regenerate-demo-trailer.ts`), the seed sets `books.trailer_url` to
`/demo-assets/trailer.mp4` and `books.trailer_status` to `'ready'`. If the
file is missing both columns are reset to NULL on every run, so the
reader UI hides the trailer section until the asset is actually there.

POD modal data is provisioned in subsequent days of the demo plan, not by
this script.

## Asset prerequisites

The seed expects these static assets to already be on disk under
`apps/web/public/demo-assets/`. They are committed to the repo so a fresh
clone is enough — but if you need to regenerate them:

```bash
# 10 short MP3 snippets — ElevenLabs eleven_multilingual_v2 with the
# team voice. Requires ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID in
# apps/web/.env.local. ~2 500 chars per full regen.
npx tsx apps/web/scripts/regenerate-demo-audio-elevenlabs.ts

# 40 native-format SVG thumbnails (any platform; pure string templating)
npx tsx apps/web/scripts/generate-demo-social-thumbs.ts

# 1 ~5s book trailer via Higgsfield image-to-video. Requires
# HF_CREDENTIALS (KEY_ID:KEY_SECRET) in apps/web/.env.local AND a publicly
# fetchable cover image URL passed as CLI arg or COVER_IMAGE_URL env. The
# seed picks the resulting trailer.mp4 up automatically — books.trailer_url
# stays NULL until the file exists on disk.
npx tsx apps/web/scripts/regenerate-demo-trailer.ts <cover-image-url>
```

If either set is missing the seed aborts with a pointer to the right script.

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
#   versions touched:    10
#   chapters touched:    10
#   translation rows:    9
#   audiobook assets:    10
#   marketing campaigns: 12
#   stale campaigns gc:  28 on first run after the 10→3 language narrowing,
#                        0 on every run thereafter
# After two runs, the underlying tables still hold exactly:
#   1 row in profiles where username='verkli-demo'
#   1 row in books where slug='the-haunted-diary'
#   10 rows in book_versions for that book
#   10 rows in chapters across those versions
#   9 rows in book_translations for that book
#   10 rows in audiobook_assets for that book (one per language)
#   12 rows in marketing_campaigns (3 langs × 4 channels)
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
