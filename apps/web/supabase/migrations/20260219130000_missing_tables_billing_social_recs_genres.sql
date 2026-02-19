-- Migration: Add missing DB objects referenced by application code
-- Tables: billing_plan_catalog, social_connections, genres, book_genres,
--         reader_genre_preferences, reader_book_signals, recommendations
-- View:   social_connections_safe

-- ─────────────────────────────────────────────────────────────
-- 1. billing_plan_catalog
--    Ref: lib/billing/catalog.ts – maps Stripe price_id to (role, plan_key)
--    Accessed via admin client (service role) – no user RLS needed.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_plan_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL,                    -- catalog.ts .eq("provider", "stripe")
  role        text NOT NULL,                    -- "reader" | "author"
  plan_key    text NOT NULL,                    -- "plus" | "pro"
  price_id    text NOT NULL,                    -- Stripe price_id, matched in resolveRolePlanFromPriceIds
  is_active   boolean NOT NULL DEFAULT true,    -- catalog.ts .eq("is_active", true)
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, role, plan_key)
);

CREATE INDEX IF NOT EXISTS billing_plan_catalog_provider_active_idx
  ON public.billing_plan_catalog (provider, is_active) WHERE is_active = true;

ALTER TABLE public.billing_plan_catalog ENABLE ROW LEVEL SECURITY;
-- No user-facing policies: accessed only via createAdminClient() (service role).

COMMENT ON TABLE public.billing_plan_catalog IS 'Maps payment-provider price IDs to role+plan; queried by billing/catalog.ts via admin client';

-- ─────────────────────────────────────────────────────────────
-- 2. social_connections
--    Ref: social-publish-worker.ts, api/social/connect/[platform],
--         api/social/callback/[platform], api/social/connections/[platform],
--         api/dev/social-mock
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_connections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform            text NOT NULL,                    -- "x", "email", etc.
  access_token_enc    text,                             -- encrypted OAuth token
  refresh_token_enc   text,                             -- encrypted refresh token
  token_expires_at    timestamptz,                      -- worker checks & refreshes
  email_config_enc    text,                             -- encrypted SMTP config (email platform)
  platform_user_id    text,                             -- external user id
  platform_username   text,                             -- display handle
  status              text NOT NULL DEFAULT 'active',   -- "active" | "revoked"
  connected_at        timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)                            -- upsert conflict key
);

CREATE INDEX IF NOT EXISTS social_connections_user_status_idx
  ON public.social_connections (user_id, status);

ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

-- Users see only their own connections
DROP POLICY IF EXISTS social_connections_select_own ON public.social_connections;
CREATE POLICY social_connections_select_own ON public.social_connections
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own
DROP POLICY IF EXISTS social_connections_insert_own ON public.social_connections;
CREATE POLICY social_connections_insert_own ON public.social_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own
DROP POLICY IF EXISTS social_connections_update_own ON public.social_connections;
CREATE POLICY social_connections_update_own ON public.social_connections
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own
DROP POLICY IF EXISTS social_connections_delete_own ON public.social_connections;
CREATE POLICY social_connections_delete_own ON public.social_connections
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.social_connections IS 'OAuth/SMTP credentials for social publishing; encrypted token columns hidden from safe view';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_social_connections_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS social_connections_updated_at ON public.social_connections;
CREATE TRIGGER social_connections_updated_at
  BEFORE UPDATE ON public.social_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_social_connections_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. social_connections_safe (VIEW)
--    Ref: api/social/connections/route.ts – selects
--         id, platform, platform_username, status, token_expires_at, connected_at, updated_at
--    Deliberately omits encrypted token columns.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.social_connections_safe AS
  SELECT
    id,
    user_id,
    platform,
    platform_username,
    status,
    token_expires_at,
    connected_at,
    updated_at
  FROM public.social_connections;

COMMENT ON VIEW public.social_connections_safe IS 'Safe projection of social_connections – no encrypted token columns; RLS from base table applies';

-- ─────────────────────────────────────────────────────────────
-- 4. genres
--    Ref: api/genres/route.ts          – select id, name
--         discover/page.tsx            – select id, slug, name_sv, name_en, icon, display_order
--         GenreSelector.tsx            – expects id, slug, name_sv, name_en, icon
--         OnboardingFlow.tsx interface – id, slug, name_sv, name_en, icon, display_order
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.genres (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE,              -- URL-friendly identifier
  name           text NOT NULL,                     -- api/genres selects "name"
  name_sv        text NOT NULL,                     -- Swedish name for UI
  name_en        text,                              -- English name for UI
  icon           text,                              -- emoji or icon code
  display_order  integer NOT NULL DEFAULT 0,        -- discover page orders by this
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS genres_display_order_idx ON public.genres (display_order);

ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;

-- Public read; writes via service role only
DROP POLICY IF EXISTS genres_select_all ON public.genres;
CREATE POLICY genres_select_all ON public.genres
  FOR SELECT USING (true);

COMMENT ON TABLE public.genres IS 'Genre catalog; publicly readable, admin-managed';

-- Seed starter genres (Swedish-first platform)
INSERT INTO public.genres (slug, name, name_sv, name_en, icon, display_order) VALUES
  ('fiction',     'Fiction',     'Skönlitteratur',  'Fiction',      NULL, 1),
  ('non-fiction', 'Non-Fiction', 'Facklitteratur',  'Non-Fiction',  NULL, 2),
  ('fantasy',     'Fantasy',    'Fantasy',          'Fantasy',      NULL, 3),
  ('sci-fi',      'Sci-Fi',     'Science fiction',  'Sci-Fi',       NULL, 4),
  ('romance',     'Romance',    'Romans',           'Romance',      NULL, 5),
  ('mystery',     'Mystery',    'Mysterium',        'Mystery',      NULL, 6),
  ('thriller',    'Thriller',   'Thriller',         'Thriller',     NULL, 7),
  ('horror',      'Horror',     'Skräck',           'Horror',       NULL, 8),
  ('biography',   'Biography',  'Biografi',         'Biography',    NULL, 9),
  ('self-help',   'Self-Help',  'Självhjälp',       'Self-Help',    NULL, 10),
  ('history',     'History',    'Historia',         'History',      NULL, 11),
  ('poetry',      'Poetry',     'Poesi',            'Poetry',       NULL, 12),
  ('drama',       'Drama',      'Drama',            'Drama',        NULL, 13),
  ('children',    'Children',   'Barnlitteratur',   'Children',     NULL, 14),
  ('young-adult', 'Young Adult','Ungdomslitteratur','Young Adult',  NULL, 15),
  ('comics',      'Comics',     'Serier',           'Comics',       NULL, 16)
ON CONFLICT (slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 5. book_genres (junction)
--    Ref: api/books/[id]/genres – GET, PUT (delete+insert)
--         recommendations/for-you, scoring.ts, ForYouRail, SimilarBooksRail,
--         recommendations-worker
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.book_genres (
  book_id   uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  genre_id  uuid NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, genre_id)
);

CREATE INDEX IF NOT EXISTS book_genres_genre_id_idx ON public.book_genres (genre_id);

ALTER TABLE public.book_genres ENABLE ROW LEVEL SECURITY;

-- Everyone can read (discovery needs this)
DROP POLICY IF EXISTS book_genres_select_all ON public.book_genres;
CREATE POLICY book_genres_select_all ON public.book_genres
  FOR SELECT USING (true);

-- Authors can manage genres for their own books (checked via books.author_id in app code)
DROP POLICY IF EXISTS book_genres_insert_authenticated ON public.book_genres;
CREATE POLICY book_genres_insert_authenticated ON public.book_genres
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.books WHERE books.id = book_id AND books.author_id = auth.uid())
  );

DROP POLICY IF EXISTS book_genres_delete_authenticated ON public.book_genres;
CREATE POLICY book_genres_delete_authenticated ON public.book_genres
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.books WHERE books.id = book_id AND books.author_id = auth.uid())
  );

COMMENT ON TABLE public.book_genres IS 'M:N junction between books and genres; public read, author write';

-- ─────────────────────────────────────────────────────────────
-- 6. reader_genre_preferences
--    Ref: recommendations-worker.ts – select genre_id, weight where user_id
--         ForYouRail.tsx             – select genre_id where user_id
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reader_genre_preferences (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  genre_id   uuid NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  weight     real NOT NULL DEFAULT 1.0,   -- worker reads weight, defaults 1.0
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, genre_id)
);

ALTER TABLE public.reader_genre_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reader_genre_preferences_select_own ON public.reader_genre_preferences;
CREATE POLICY reader_genre_preferences_select_own ON public.reader_genre_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS reader_genre_preferences_insert_own ON public.reader_genre_preferences;
CREATE POLICY reader_genre_preferences_insert_own ON public.reader_genre_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS reader_genre_preferences_delete_own ON public.reader_genre_preferences;
CREATE POLICY reader_genre_preferences_delete_own ON public.reader_genre_preferences
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.reader_genre_preferences IS 'Per-user genre weights for recommendation scoring; user-scoped RLS';

-- ─────────────────────────────────────────────────────────────
-- 7. reader_book_signals
--    Ref: recommendations-worker.ts – select book_id where user_id, signal="like"
--         OnboardingFlow sends bookSignals with signal "like"|"skip"
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reader_book_signals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id    uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  signal     text NOT NULL,                         -- "like" | "skip"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS reader_book_signals_user_signal_idx
  ON public.reader_book_signals (user_id, signal);

ALTER TABLE public.reader_book_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reader_book_signals_select_own ON public.reader_book_signals;
CREATE POLICY reader_book_signals_select_own ON public.reader_book_signals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS reader_book_signals_insert_own ON public.reader_book_signals;
CREATE POLICY reader_book_signals_insert_own ON public.reader_book_signals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS reader_book_signals_update_own ON public.reader_book_signals;
CREATE POLICY reader_book_signals_update_own ON public.reader_book_signals
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS reader_book_signals_delete_own ON public.reader_book_signals;
CREATE POLICY reader_book_signals_delete_own ON public.reader_book_signals
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.reader_book_signals IS 'User like/skip signals on books; drives collaborative filtering in recommendation engine';

-- ─────────────────────────────────────────────────────────────
-- 8. recommendations
--    Ref: recommendations-worker.ts – delete where user_id, insert batch
--         ForYouRail.tsx            – select book_id,score,reason,rank where user_id
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recommendations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id     uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  score       real NOT NULL DEFAULT 0,              -- recommendation score
  reason      text NOT NULL DEFAULT 'personalized', -- "personalized","genre_match","collaborative","author_affinity"
  rank        integer NOT NULL DEFAULT 0,           -- position in ranked list
  batch_id    text NOT NULL,                        -- groups recs from same compute run
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recommendations_user_rank_idx
  ON public.recommendations (user_id, rank);

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recommendations_select_own ON public.recommendations;
CREATE POLICY recommendations_select_own ON public.recommendations
  FOR SELECT USING (auth.uid() = user_id);

-- Insert/delete via service role (worker), no user insert/delete policies needed.

COMMENT ON TABLE public.recommendations IS 'Pre-computed personalized book recommendations per user; written by worker, read by ForYouRail';
