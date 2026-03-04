# Database Architecture

> Last updated: 2026-03-04
> Migration consolidation: `db/migration-consolidation` branch

## Canonical Migration Directory

```
apps/web/supabase/migrations/   <-- ALL migrations live here
```

The legacy directory `packages/db/supabase/migrations/` has been archived to
`packages/db/supabase/migrations_archived/`. See the README there for the
mapping table. **Do not add new migrations to packages/db.**

Supabase CLI config: `apps/web/supabase/config.toml`

---

## Migration Timeline

| Range | Phase | Count |
|---|---|---|
| `20250101–20250211` | Core schema (books, chapters, readings, imports, translations, audiobooks, marketing, discovery) | 14 |
| `20260203–20260210` | Versioning, visibility, worker contract, monetization | 18 |
| `20260210–20260216` | Billing, referrals, donations, DM, community, content generation | 16 |
| `20260219–20260226` | Genres, recommendations, TTS, media assets, usage tracking | 8 |
| `20260304` | Foundation consolidation (users trigger, shelves, profiles, newsletters, readings RLS) | 1 |

Total: **57 migrations**

---

## Important Tables

### books

Core content table. Author-owned, status-driven visibility.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| title | text NOT NULL | |
| slug | text NOT NULL | |
| description | text | |
| cover_image | text | |
| author_id | uuid FK -> auth.users | ON DELETE CASCADE |
| status | text | DRAFT / PUBLISHED / ARCHIVED |
| published | boolean | |
| published_at | timestamptz | |
| language | text | ISO 639-1, default 'en' |
| original_language | text | default 'en' |
| is_translation | boolean | |
| original_book_id | uuid FK -> books | self-referential, ON DELETE SET NULL |
| translation_status | text | draft / needs_review / ready / published |
| audiobook_status | text | not_started / generating / published / failed |
| is_featured | boolean | |
| featured_rank | integer | |
| featured_until | timestamptz | |
| price_amount | integer | nullable, minor units |
| price_currency | text | SEK / EUR / USD |
| pricing_model | text | book_only |
| is_free | boolean GENERATED | from price_amount |
| created_at, updated_at | timestamptz | auto-updated via trigger |

RLS: SELECT via `can_view_book()` helper + author access. UPDATE for author.
INSERT/DELETE require service role.

### book_versions

Per-language versions of a book. Tied to chapters.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| book_id | uuid FK -> books | ON DELETE CASCADE |
| language_code | text NOT NULL | |
| status | text | draft / translating / done / failed |
| visibility | text | public / followers / private |
| published_at | timestamptz | |
| published_chapter_count | integer | partial release support |
| error_message | text | translation failure details |

UNIQUE(book_id, language_code). RLS: visibility-aware SELECT, author-only write.

### chapters

Book content, scoped to a book_version.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| book_id | uuid FK -> books | ON DELETE CASCADE |
| book_version_id | uuid FK -> book_versions | NOT NULL, ON DELETE CASCADE |
| title | text NOT NULL | |
| content | text | |
| order | integer | |
| source_text | text | original pre-translation text |
| content_hash | text | for cache invalidation |

UNIQUE(book_version_id, "order"). RLS: visibility + partial chapter release.

### ai_jobs

Generic job queue for background AI processing.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK -> auth.users | ON DELETE CASCADE |
| kind | text NOT NULL | job type discriminator |
| status | text | pending / processing / completed / failed / cancelled |
| input | jsonb | job parameters (bookId historically stored here) |
| output | jsonb | job results |
| error | text | |
| book_id | uuid FK -> books | nullable, ON DELETE CASCADE |
| book_version_id | uuid FK -> book_versions | nullable, ON DELETE SET NULL |
| language | text | |
| progress | integer | 0-100 |
| started_at, finished_at | timestamptz | |

RLS: user-scoped CRUD.

**Note:** `book_id` is nullable and was backfilled from `input->>'bookId'`. When deleting a book, filter ai_jobs by `input->>'bookId'` as well.

### content_assets

Generated marketing content (video, image, text).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| book_id | uuid FK -> books | ON DELETE CASCADE |
| user_id | uuid FK -> auth.users | ON DELETE CASCADE |
| content_type | text | video / image / text |
| channel | text | ig / tiktok / x / email / generic |
| version | integer | |
| status | text | pending / running / completed / failed |
| visibility | text | private / public |
| prompt_template, prompt_rendered | text | |
| config | jsonb | |
| asset_url | text | |
| text_content | jsonb | |
| metadata | jsonb | |
| error | text | |
| book_snapshot | jsonb | |

UNIQUE(book_id, content_type, channel, version). RLS: user-scoped.

### media_assets

Video trailers (Higgsfield integration).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK -> auth.users | ON DELETE CASCADE |
| book_id | uuid FK -> books | nullable, ON DELETE SET NULL |
| type | text | video |
| status | media_asset_status enum | draft / generating / ready / failed |
| provider | media_provider enum | higgsfield |
| provider_request_id | text | |
| input_json | jsonb | |
| output_url | text | |
| duration_seconds | integer | default 5 |
| metadata | jsonb | scenes, caption, hashtags, generation_time_ms |
| estimated_cost_usd | numeric | |
| error | text | |

RLS: user-scoped. **Note:** book_id uses ON DELETE SET NULL (media survives book deletion).

### recommendations

Personalized book recommendations computed by worker.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK -> auth.users | ON DELETE CASCADE |
| book_id | uuid FK -> books | ON DELETE CASCADE |
| score | real | |
| reason | text | default 'personalized' |
| rank | integer | |
| batch_id | text | |
| computed_at | timestamptz | |

RLS: SELECT own only. No write policies (service role only).

### tts_preview_jobs

Standalone TTS Lab preview generation.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK -> auth.users | ON DELETE CASCADE |
| role | text | author / reader |
| text | text NOT NULL | |
| voice_id | text | default 'Ryan' |
| speed | numeric | |
| seed | integer | |
| format | text | wav / mp3 |
| status | text | queued / running / succeeded / failed |
| progress | integer | |
| audio_path | text | |
| error | text | |

RLS: SELECT own + admin, INSERT own. Updates via service role.

---

## Storage Buckets

| Bucket | Public | Max Size | Purpose |
|---|---|---|---|
| book_covers | yes | 10 MB | Book cover images |
| audiobooks | **no** | 512 MB | Generated audiobook files (signed URLs) |
| tts-outputs | yes | 512 MB | TTS generation outputs |
| tts_previews | **no** | 80 MB | TTS Lab preview audio |
| content-assets | yes | 512 MB | Marketing content (images, video) |
| marketing-media | yes | 100 MB | Video trailers |

---

## Views

| View | Purpose | Security |
|---|---|---|
| `job_status_view` | Unified job status across imports, translations, audiobooks | `security_invoker = on` (respects caller's RLS) |
| `social_connections_safe` | Social connections without encrypted tokens | Inherits from base table RLS |

---

## Key Functions & Triggers

| Function | Purpose |
|---|---|
| `handle_new_user()` | Syncs auth.users INSERT to public.users |
| `handle_user_update()` | Syncs auth.users UPDATE to public.users |
| `update_updated_at_column()` | Generic updated_at trigger (reused by 20+ tables) |
| `can_view_book(book_id, viewer_id)` | SECURITY DEFINER helper for book visibility |
| `sync_book_audiobook_status_from_assets()` | Auto-sync audiobook_assets changes to books.audiobook_status |
| `refresh_book_audiobook_status(book_id)` | Manual audiobook status refresh |
| `grant_user_credits_once()` | Idempotent credit grant |
| `dm_consume_rate_limit(sender_id)` | DM rate limiting (12/min window) |

---

## RLS Strategy

| Pattern | Tables | Write via |
|---|---|---|
| User-scoped (own rows only) | readings, shelves, bookmarks, feedback, ai_jobs, offline_manifests, etc. | Client SDK |
| Author-scoped (own books) | books, chapters, book_versions, marketing_campaigns, content_assets | Client SDK |
| Public read + owner write | curated_lists, book_genres, reviews | Client SDK |
| Service role only (no user write policies) | orders, entitlements, recommendations, analytics_events, marketing_caption_cache | Admin client / Worker |
| Visibility-aware (public/followers/private) | books (SELECT), book_versions (SELECT), chapters (SELECT) | `can_view_book()` helper |

---

## Book Delete Cleanup Order

When deleting a book, clean up BEFORE the cascade:

1. `chapter_audio_cache` — via chapter IDs (no direct book FK)
2. `ai_jobs` — filter by `input->>'bookId'` AND `book_id`
3. `book_imports` — explicit delete (`book_id` uses ON DELETE SET NULL, leaves orphans)
4. `books` row — CASCADE handles: chapters, book_versions, audiobook_assets, marketing_campaigns, orders, entitlements, content_assets, curated_list_items, comments, book_genres, reader_book_signals, recommendations, shelf_books

**Note:** `media_assets.book_id` uses ON DELETE SET NULL (survives book deletion).

---

## Backup & Rollback Strategy

### Schema Export

```bash
# Export current remote schema
npx supabase db dump --project-ref <PROJECT_REF> > backups/schema_$(date +%Y%m%d).sql

# Export specific table data
npx supabase db dump --project-ref <PROJECT_REF> --data-only --table books > backups/books_data_$(date +%Y%m%d).sql

# Local diff against remote
npx supabase db diff --project-ref <PROJECT_REF>
```

### Before Applying Migrations

1. **Export full schema** using `supabase db dump`
2. **Snapshot critical tables** (books, chapters, ai_jobs, orders) with `--data-only`
3. **Test locally first** with `supabase db reset` against local instance

### Rollback Instructions

Supabase migrations are forward-only. To rollback:

1. **Identify the failing migration** from `supabase_migrations.schema_migrations` table
2. **Write a reverse migration** that undoes the changes (DROP TABLE IF EXISTS, DROP POLICY, etc.)
3. **Never delete rows from `schema_migrations`** — add a new forward migration instead
4. **For the consolidation migration** (`20260304000000`): all statements are idempotent (IF NOT EXISTS). Rolling back means dropping the tables/policies it created, but only if they didn't exist before:

```sql
-- Reverse 20260304000000 (only if tables were newly created by this migration)
-- WARNING: Only run this if the tables had no pre-existing data
DROP TABLE IF EXISTS public.newsletters CASCADE;
DROP TABLE IF EXISTS public.newsletter_subscriptions CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.shelf_books CASCADE;
DROP TABLE IF EXISTS public.shelf_sections CASCADE;
DROP TABLE IF EXISTS public.shelves CASCADE;
-- User triggers and readings RLS are safe to leave in place
```

### Emergency Recovery

```bash
# Restore from pg_dump backup
psql $DATABASE_URL < backups/schema_YYYYMMDD.sql

# Or use Supabase point-in-time recovery (Pro plan)
# Dashboard > Database > Backups > Restore to point in time
```

---

## Schema Consistency Notes

Verified tables: books, book_versions, chapters, ai_jobs, content_assets, media_assets, recommendations, tts_preview_jobs.

### Known Minor Issues

| Issue | Table | Severity | Detail |
|---|---|---|---|
| Missing WITH CHECK on UPDATE | media_assets | Low | Could allow ownership transfer. Other tables have it. |
| No unique(user_id, book_id) | recommendations | Low | Duplicates prevented at app level (delete+insert). |
| Status vocabulary mismatch | ai_jobs vs tts_preview_jobs | Info | Different systems, intentional. |
| No INSERT/DELETE RLS | books | Medium | Controlled via API middleware / service role. |

None of these are blocking for production.

---

## Migration Naming Convention

```
YYYYMMDDHHMMSS_description.sql
```

All new migrations go in `apps/web/supabase/migrations/`.
Use `IF NOT EXISTS` / `DROP IF EXISTS` for idempotency where possible.
