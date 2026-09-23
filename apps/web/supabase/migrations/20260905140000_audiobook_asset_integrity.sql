-- Two gaps in audiobook_assets that both let a launch ship something that looks
-- like a finished audiobook and is not.
--
-- Probed against the live table before writing this (2026-09-05): 14 rows,
-- 14 distinct (book_id, language), zero NULL languages. The unique index applies
-- cleanly today. Written defensively anyway — "clean when I looked" and "clean
-- when it runs" are different claims.

-- ── 1. The invariant the code already assumes, now enforced ──────────────────
--
-- audiobook-worker.ts already does a processor-level dedupe: before generating a
-- book-scoped audiobook it looks for an existing `generated` asset for the same
-- (book_id, language) and skips. So the application has always treated this pair
-- as unique — the database never agreed. Two workers racing the same job, a
-- retry landing beside its original, or migrate-book-versions.ts re-pointing
-- `book_id` at a book that already has that language, each produce a second row.
-- The reader path then picks between them by `created_at`; the newest wins and
-- nothing anywhere says the other exists.
--
-- NOT partial, deliberately. A partial index (`where status = 'generated'`) is
-- the tighter constraint, but PostgREST cannot name a partial index as an
-- ON CONFLICT arbiter, so the worker could not upsert against it — and upsert is
-- what makes regenerating an audiobook replace its row instead of erroring.
-- Every insert in the repo writes status = 'generated' (audiobook-worker.ts,
-- seed-investor-demo.ts), so a plain index constrains exactly the same rows
-- today while staying usable.
create unique index if not exists audiobook_assets_book_language_key
  on public.audiobook_assets (book_id, language);

-- ── 2. Smoke audio must be distinguishable from real audio ───────────────────
--
-- PIPELINE_SMOKE_MODE makes the worker synthesise a SILENT wav
-- (audiobook-worker.ts: createSilentWavBuffer) and store it exactly like real
-- narration. The only trace was a line in the worker's startup log, long gone by
-- the time anyone asks "is this book's audio real?".
--
-- That is the shape of a launch-day discovery: a reader buys an audiobook, gets
-- silence, and the database cannot tell you it was ever going to.
--
-- Defaults false, so existing rows read as real audio. That is the honest
-- default only because smoke mode has never been the production setting; where
-- that is in doubt for a given book, regenerate rather than trust the column.
alter table public.audiobook_assets
  add column if not exists is_smoke boolean not null default false;

comment on column public.audiobook_assets.is_smoke is
  'True when the audio was produced under PIPELINE_SMOKE_MODE and is silence, not narration. Never serve a row with this set as a finished audiobook.';
