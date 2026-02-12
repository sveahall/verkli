# SCHEMA_GAPS

## Scope
Jämförelsen nedan är gjord mellan:
- Runtime-referenser i `apps/web/src` och `apps/web/scripts` (`.from("...")`)
- Migrationer i:
  - `apps/web/supabase/migrations`
  - `packages/db/supabase/migrations`

Kontrollmetod:
- Runtime-tabeller extraherades från kodreferenser.
- Migrations-tabeller extraherades från `CREATE TABLE` i båda migrationsspåren.
- Diff = referenser i runtime som saknar `CREATE TABLE` i båda migrationsspåren.

## Resultat
Verifierad diff (runtime minus migrations):
- `book_genres`
- `genres`
- `reader_book_signals`
- `reader_genre_preferences`
- `recommendations`
- `social_connections`
- `social_connections_safe`
- `avatars` (se notering nedan: storage-bucket, inte DB-tabell)

## Saknade tabeller (DB)

### 1) `social_connections`
- Användning i runtime:
  - `apps/web/scripts/social-publish-worker.ts:155`
  - `apps/web/scripts/social-publish-worker.ts:191`
  - `apps/web/src/app/api/social/connect/[platform]/route.ts:49`
  - `apps/web/src/app/api/social/connect/[platform]/route.ts:75`
  - `apps/web/src/app/api/social/callback/[platform]/route.ts:83`
  - `apps/web/src/app/api/social/connections/[platform]/route.ts:40`
  - `apps/web/src/app/api/social/connections/[platform]/route.ts:64`
  - `apps/web/src/app/api/dev/social-mock/route.ts:32`
- Migration-status:
  - Ingen `CREATE TABLE ... social_connections` i `apps/web/supabase/migrations`
  - Ingen `CREATE TABLE ... social_connections` i `packages/db/supabase/migrations`

### 2) `social_connections_safe`
- Användning i runtime:
  - `apps/web/src/app/api/social/connections/route.ts:27`
- Migration-status:
  - Ingen `CREATE TABLE ... social_connections_safe` i `apps/web/supabase/migrations`
  - Ingen `CREATE TABLE ... social_connections_safe` i `packages/db/supabase/migrations`

### 3) `recommendations`
- Användning i runtime:
  - `apps/web/scripts/recommendations-worker.ts:239`
  - `apps/web/scripts/recommendations-worker.ts:242`
  - `apps/web/src/components/reader/ForYouRail.tsx:13`
- Migration-status:
  - Ingen `CREATE TABLE ... recommendations` i `apps/web/supabase/migrations`
  - Ingen `CREATE TABLE ... recommendations` i `packages/db/supabase/migrations`

### 4) `book_genres`
- Användning i runtime:
  - `apps/web/scripts/recommendations-worker.ts:81`
  - `apps/web/scripts/recommendations-worker.ts:96`
  - `apps/web/src/lib/recommendations/scoring.ts:36`
  - `apps/web/src/components/reader/ForYouRail.tsx:75`
  - `apps/web/src/components/reader/SimilarBooksRail.tsx:25`
  - `apps/web/src/app/api/recommendations/for-you/route.ts:79`
  - `apps/web/src/app/api/books/[id]/genres/route.ts:14`
  - `apps/web/src/app/api/books/[id]/genres/route.ts:75`
  - `apps/web/src/app/api/books/[id]/genres/route.ts:90`
- Migration-status:
  - Ingen `CREATE TABLE ... book_genres` i `apps/web/supabase/migrations`
  - Ingen `CREATE TABLE ... book_genres` i `packages/db/supabase/migrations`

### 5) `genres`
- Användning i runtime:
  - `apps/web/src/app/(reader-browse)/reader/discover/page.tsx:178`
  - `apps/web/src/app/api/genres/route.ts:30`
- Migration-status:
  - Ingen `CREATE TABLE ... genres` i `apps/web/supabase/migrations`
  - Ingen `CREATE TABLE ... genres` i `packages/db/supabase/migrations`

### 6) `reader_genre_preferences`
- Användning i runtime:
  - `apps/web/scripts/recommendations-worker.ts:35`
  - `apps/web/src/components/reader/ForYouRail.tsx:67`
- Migration-status:
  - Ingen `CREATE TABLE ... reader_genre_preferences` i `apps/web/supabase/migrations`
  - Ingen `CREATE TABLE ... reader_genre_preferences` i `packages/db/supabase/migrations`

### 7) `reader_book_signals`
- Användning i runtime:
  - `apps/web/scripts/recommendations-worker.ts:36`
- Migration-status:
  - Ingen `CREATE TABLE ... reader_book_signals` i `apps/web/supabase/migrations`
  - Ingen `CREATE TABLE ... reader_book_signals` i `packages/db/supabase/migrations`

## Notering: `avatars`
`avatars` hittas i runtime, men i de träffar som verifierades används det som **Supabase Storage bucket** (t.ex. `supabase.storage.from("avatars")`) i:
- `apps/web/src/lib/supabase/avatar.ts:19`
- `apps/web/src/lib/supabase/storage.ts:68`
- `apps/web/src/lib/supabase/storage.ts:84`
- `apps/web/src/lib/supabase/storage.ts:98`

Detta är alltså inte bevis på saknad DB-tabell i sig. Om en `avatars`-tabell också förväntas behövs separat verifiering mot produktionsschema.

## Rekommenderad minimal åtgärd
- Skapa en dedikerad migration för tabellerna:
  - `social_connections`
  - `social_connections_safe`
  - `recommendations`
  - `book_genres`
  - `genres`
  - `reader_genre_preferences`
  - `reader_book_signals`
- Om `avatars` ska vara tabell: lägg till explicit migration för den. Om inte: ignorera den i schema-gap-diffen och behåll den som storage-bucket.
