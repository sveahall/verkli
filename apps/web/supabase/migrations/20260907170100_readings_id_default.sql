-- Reading progress has not been saved for anyone since 2026-04-02.
--
-- `readings.id` is `text`, PRIMARY KEY, NOT NULL, and had no DEFAULT. The
-- client upsert in
--   src/app/(reader-browse)/reader/read/[chapterId]/ReadingProgress.tsx
-- does not send `id`, so every insert was rejected with 23502
-- (null value in column "id" violates not-null constraint) — and the caller
-- discards the error, so nothing was logged and the feature was silently dead.
--
-- Measured 2026-09-07 against production: 4 rows total, newest
-- `last_read_at = 2026-04-02T13:31:45Z`. Nothing has been written in five
-- months, which is when the `id` field was dropped from that payload.
--
-- Consequences beyond the obvious: "Continue reading" on the reader library is
-- permanently empty, and per-book progress always renders 0%.
--
-- Fixed in the DATABASE rather than by putting `id` back in the payload.
-- PostgREST implements upsert as
-- `INSERT ... ON CONFLICT (user_id, book_id) DO UPDATE SET <supplied columns>`,
-- so supplying `id` would add `id = excluded.id` to the UPDATE branch and
-- rewrite the primary key on every single progress save. A default fills the
-- INSERT path, leaves UPDATE alone, and protects every other writer of this
-- table too.
--
-- `::text` because the column is text, not uuid — the existing four rows hold
-- uuid-shaped strings, so this keeps the format consistent.
--
-- The `onConflict` target is fine and is NOT the problem: the unique constraint
-- `readings_user_id_book_id_key` exists in production (verified via
-- `supabase inspect db index-stats`).

ALTER TABLE public.readings
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

COMMENT ON COLUMN public.readings.id IS
  'Primary key. Defaults to gen_random_uuid()::text — the client upsert does not send it, and without a default every insert failed 23502 while the caller swallowed the error.';
