-- ---------------------------------------------------------------------------
-- Performance audit: composite indexes for hot reader/author paths.
--
-- These indexes target queries identified by the April 2026 audit as
-- performing sequential scans or falling back to in-memory sorts under load.
-- Each index is paired with the specific query site in `apps/web/src/app/...`
-- that benefits from it.
-- ---------------------------------------------------------------------------

-- /reader/library and /reader/profile sort readings by last_read_at after
-- filtering on user_id. The existing (user_id, book_id) index does not
-- support the sort, so Postgres sorts the filtered set in memory on every
-- render.
CREATE INDEX IF NOT EXISTS readings_user_last_read_idx
  ON public.readings (user_id, last_read_at DESC);

-- /reader/home and /reader/discover filter published books and order by
-- published_at. A partial composite index lets this be an index-only scan
-- on the hot path without bloating the index for drafts.
CREATE INDEX IF NOT EXISTS books_status_published_at_idx
  ON public.books (status, published_at DESC)
  WHERE status = 'PUBLISHED';

-- Reader book-detail access checks hit entitlements with
-- (user_id = ?, book_id = ?, source = 'purchase'). Two single-column indexes
-- exist; a composite avoids intersecting them on every chapter load.
CREATE INDEX IF NOT EXISTS entitlements_user_book_source_idx
  ON public.entitlements (user_id, book_id, source);

-- /api/author/stats and book-level analytics queries filter by book_id plus a
-- created_at window. The existing index is on created_at alone.
CREATE INDEX IF NOT EXISTS analytics_events_book_created_idx
  ON public.analytics_events (book_id, created_at DESC);
