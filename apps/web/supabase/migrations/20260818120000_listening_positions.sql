-- WP-03: persist audiobook listening position.
--
-- Text reading position has been stored in `readings` since 20250201000000. The
-- audio equivalent never existed — zero hits for audio_position / listen_position
-- / playback_position across the repo — so a reader who paused an audiobook lost
-- their place permanently. Produktionsplan §19 lists "Lyssningsposition sparas"
-- as a launch criterion; launch-plan-2026-09.md §4 records it as missing.
--
-- Scoped per (user, chapter), NOT per (user, book):
--   Every chapter is its own audio file and its own reader route. A listener who
--   reaches chapter 5, jumps back to chapter 2 and then returns must find both
--   positions intact. `readings` is UNIQUE(user_id, book_id) and structurally
--   cannot express that, which is why this is a new table rather than two more
--   columns on `readings`.
--   `book_id` is denormalised anyway so "resume this audiobook" is a single
--   indexed lookup, and so the row dies with the book through CASCADE rather
--   than being orphaned the way `book_imports.book_id` rows are.
--
-- Drift tolerance, in the style of 20260304000000: CREATE TABLE IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS for every column that can be added safely, unique and
-- secondary indexes via CREATE INDEX IF NOT EXISTS, and every policy guarded on
-- pg_policies. This is not ceremony — the live database has already drifted from
-- these files (production `readings` has no `updated_at` despite
-- 20250201000000 declaring one, and `analytics_events` carries an INSERT policy
-- that its own migration says it does not have), so nothing here may assume the
-- schema matches this file on arrival.

CREATE TABLE IF NOT EXISTS public.listening_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  -- double precision, not integer: the player reports fractional currentTime and
  -- rounding to whole seconds on every 15s write would drift the resume point.
  position_seconds double precision NOT NULL DEFAULT 0,
  -- Nullable: with preload="none" a reader can request audio and navigate away
  -- before `loadedmetadata` ever fires, so duration is genuinely unknown then.
  duration_seconds double precision,
  -- Sticky. The API never writes `false` on update (see the progress route), so
  -- re-listening to a finished chapter cannot un-finish it.
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Columns that can be back-filled onto a pre-existing table without a rewrite
-- failure (nullable, or NOT NULL with a DEFAULT). The three foreign keys are
-- deliberately absent here: NOT NULL without a default cannot be added to a
-- populated table, and a `listening_positions` that lacks them is not this
-- table and must not be silently patched into looking like it.
ALTER TABLE public.listening_positions
  ADD COLUMN IF NOT EXISTS position_seconds double precision NOT NULL DEFAULT 0;
ALTER TABLE public.listening_positions
  ADD COLUMN IF NOT EXISTS duration_seconds double precision;
ALTER TABLE public.listening_positions
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.listening_positions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.listening_positions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Upsert target. A unique *index* rather than a table constraint so that
-- IF NOT EXISTS applies; PostgREST's on_conflict resolves against either.
CREATE UNIQUE INDEX IF NOT EXISTS listening_positions_user_chapter_key
  ON public.listening_positions (user_id, chapter_id);

-- "Where was I in this audiobook" — newest touched chapter for a user+book.
CREATE INDEX IF NOT EXISTS listening_positions_user_book_updated_idx
  ON public.listening_positions (user_id, book_id, updated_at DESC);

-- FK index so deleting a chapter does not seq-scan (docs/perf-fk-indexes.md).
CREATE INDEX IF NOT EXISTS listening_positions_chapter_id_idx
  ON public.listening_positions (chapter_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listening_positions_position_nonneg'
  ) THEN
    ALTER TABLE public.listening_positions
      ADD CONSTRAINT listening_positions_position_nonneg
      CHECK (position_seconds >= 0);
  END IF;
END $$;

-- `update_updated_at_column()` comes from 20250101000000 and is used by several
-- later migrations, but it is guarded anyway: a hard failure here would abort the
-- whole migration and take the RLS policies below down with it, and the API also
-- writes `updated_at` explicitly, so the trigger is a safety net rather than the
-- mechanism.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS update_listening_positions_updated_at
      ON public.listening_positions;
    CREATE TRIGGER update_listening_positions_updated_at
      BEFORE UPDATE ON public.listening_positions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  ELSE
    RAISE NOTICE 'update_updated_at_column() missing; listening_positions.updated_at relies on the API writing it explicitly';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- RLS — user-scoped (own rows only), per docs/DATABASE_ARCHITECTURE.md §RLS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.listening_positions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'listening_positions' AND policyname = 'listening_positions_select_own'
  ) THEN
    CREATE POLICY listening_positions_select_own
      ON public.listening_positions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'listening_positions' AND policyname = 'listening_positions_insert_own'
  ) THEN
    CREATE POLICY listening_positions_insert_own
      ON public.listening_positions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- WITH CHECK as well as USING, so a row cannot be reassigned to another user by
-- updating user_id. docs/DATABASE_ARCHITECTURE.md §"Known Minor Issues" flags
-- exactly that omission on media_assets; not repeating it here.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'listening_positions' AND policyname = 'listening_positions_update_own'
  ) THEN
    CREATE POLICY listening_positions_update_own
      ON public.listening_positions FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'listening_positions' AND policyname = 'listening_positions_delete_own'
  ) THEN
    CREATE POLICY listening_positions_delete_own
      ON public.listening_positions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

COMMENT ON TABLE public.listening_positions IS
  'Audiobook playback position per (user, chapter); RLS select/insert/update/delete own. Written by /api/books/[id]/audiobook/progress with the caller session so RLS applies.';
COMMENT ON COLUMN public.listening_positions.position_seconds IS
  'Last known playback offset in seconds. Last-write-wins, NOT advance-only: rewinding is a deliberate reader action and must be preserved.';
COMMENT ON COLUMN public.listening_positions.completed IS
  'Sticky true once the chapter has been played to the end; never written back to false.';
