-- Migration Consolidation: Port foundational schemas from packages/db
-- Source: packages/db/supabase/migrations/ (00001–00010)
-- Reason: Unifying all migrations under apps/web/supabase/migrations/
-- All statements are idempotent (IF NOT EXISTS / DROP IF EXISTS)

-- ═══════════════════════════════════════════════════════════════
-- 1. User sync triggers (from 00001_create_users_trigger.sql)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, name, "avatarUrl", role, "createdAt", "updatedAt")
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'READER',
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS trigger AS $$
BEGIN
  UPDATE public.users
  SET
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    "avatarUrl" = NEW.raw_user_meta_data->>'avatar_url',
    "updatedAt" = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_update();

-- Users RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users are viewable by everyone'
  ) THEN
    CREATE POLICY "Users are viewable by everyone"
      ON public.users FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.users FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 2. Readings RLS (from 00002_rls_policies.sql — gap fix)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'readings' AND policyname = 'Users can view own readings'
  ) THEN
    CREATE POLICY "Users can view own readings"
      ON public.readings FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'readings' AND policyname = 'Users can create readings'
  ) THEN
    CREATE POLICY "Users can create readings"
      ON public.readings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'readings' AND policyname = 'Users can update own readings'
  ) THEN
    CREATE POLICY "Users can update own readings"
      ON public.readings FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 3. Shelves (from 00003_create_shelves.sql + 00004_add_shelf_fields.sql)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.shelves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subtitle TEXT,
  cover_url TEXT,
  cover_type TEXT DEFAULT 'image' CHECK (cover_type IN ('image', 'gradient')),
  cover_gradient TEXT,
  typography JSONB DEFAULT '{}'::jsonb,
  sort_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shelves_user_id_idx ON public.shelves(user_id);
CREATE INDEX IF NOT EXISTS shelves_sort_index_idx ON public.shelves(user_id, sort_index);

CREATE TABLE IF NOT EXISTS public.shelf_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id UUID NOT NULL REFERENCES public.shelves(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shelf_sections_shelf_id_idx ON public.shelf_sections(shelf_id);
CREATE INDEX IF NOT EXISTS shelf_sections_sort_index_idx ON public.shelf_sections(shelf_id, sort_index);

CREATE TABLE IF NOT EXISTS public.shelf_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id UUID NOT NULL REFERENCES public.shelves(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.shelf_sections(id) ON DELETE SET NULL,
  sort_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT shelf_books_unique UNIQUE (shelf_id, book_id)
);

CREATE INDEX IF NOT EXISTS shelf_books_shelf_id_idx ON public.shelf_books(shelf_id);
CREATE INDEX IF NOT EXISTS shelf_books_book_id_idx ON public.shelf_books(book_id);
CREATE INDEX IF NOT EXISTS shelf_books_section_id_idx ON public.shelf_books(section_id);
CREATE INDEX IF NOT EXISTS shelf_books_sort_index_idx ON public.shelf_books(shelf_id, section_id, sort_index);

-- Shelves RLS
ALTER TABLE public.shelves ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelves' AND policyname = 'Users can view own shelves') THEN
    CREATE POLICY "Users can view own shelves" ON public.shelves FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelves' AND policyname = 'Users can create own shelves') THEN
    CREATE POLICY "Users can create own shelves" ON public.shelves FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelves' AND policyname = 'Users can update own shelves') THEN
    CREATE POLICY "Users can update own shelves" ON public.shelves FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelves' AND policyname = 'Users can delete own shelves') THEN
    CREATE POLICY "Users can delete own shelves" ON public.shelves FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Shelf Sections RLS
ALTER TABLE public.shelf_sections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelf_sections' AND policyname = 'Users can view sections in own shelves') THEN
    CREATE POLICY "Users can view sections in own shelves" ON public.shelf_sections FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.shelves WHERE shelves.id = shelf_sections.shelf_id AND shelves.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelf_sections' AND policyname = 'Users can create sections in own shelves') THEN
    CREATE POLICY "Users can create sections in own shelves" ON public.shelf_sections FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM public.shelves WHERE shelves.id = shelf_sections.shelf_id AND shelves.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelf_sections' AND policyname = 'Users can update sections in own shelves') THEN
    CREATE POLICY "Users can update sections in own shelves" ON public.shelf_sections FOR UPDATE
      USING (EXISTS (SELECT 1 FROM public.shelves WHERE shelves.id = shelf_sections.shelf_id AND shelves.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelf_sections' AND policyname = 'Users can delete sections in own shelves') THEN
    CREATE POLICY "Users can delete sections in own shelves" ON public.shelf_sections FOR DELETE
      USING (EXISTS (SELECT 1 FROM public.shelves WHERE shelves.id = shelf_sections.shelf_id AND shelves.user_id = auth.uid()));
  END IF;
END $$;

-- Shelf Books RLS
ALTER TABLE public.shelf_books ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelf_books' AND policyname = 'Users can view books in own shelves') THEN
    CREATE POLICY "Users can view books in own shelves" ON public.shelf_books FOR SELECT
      USING (EXISTS (SELECT 1 FROM public.shelves WHERE shelves.id = shelf_books.shelf_id AND shelves.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelf_books' AND policyname = 'Users can add books to own shelves') THEN
    CREATE POLICY "Users can add books to own shelves" ON public.shelf_books FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.shelves WHERE shelves.id = shelf_books.shelf_id AND shelves.user_id = auth.uid())
        AND EXISTS (SELECT 1 FROM public.books WHERE books.id = shelf_books.book_id AND (books.author_id = auth.uid() OR books.status = 'PUBLISHED'))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelf_books' AND policyname = 'Users can update books in own shelves') THEN
    CREATE POLICY "Users can update books in own shelves" ON public.shelf_books FOR UPDATE
      USING (EXISTS (SELECT 1 FROM public.shelves WHERE shelves.id = shelf_books.shelf_id AND shelves.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'shelf_books' AND policyname = 'Users can remove books from own shelves') THEN
    CREATE POLICY "Users can remove books from own shelves" ON public.shelf_books FOR DELETE
      USING (EXISTS (SELECT 1 FROM public.shelves WHERE shelves.id = shelf_books.shelf_id AND shelves.user_id = auth.uid()));
  END IF;
END $$;

-- Shelf triggers
CREATE TRIGGER update_shelves_updated_at
  BEFORE UPDATE ON public.shelves
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shelf_sections_updated_at
  BEFORE UPDATE ON public.shelf_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shelf_books_updated_at
  BEFORE UPDATE ON public.shelf_books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- 4. Profiles (from 00004_create_profiles.sql)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  username TEXT UNIQUE,
  bio TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'author' CHECK (role IN ('author', 'reader')),
  preferences JSONB DEFAULT '{}'::jsonb,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;
CREATE POLICY "Public profiles are viewable"
  ON public.profiles FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Public shelf visibility (depends on profiles + shelves)
DROP POLICY IF EXISTS "Public shelves are viewable" ON public.shelves;
CREATE POLICY "Public shelves are viewable"
  ON public.shelves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = shelves.user_id AND profiles.is_public = true
    )
  );

DROP POLICY IF EXISTS "Public shelf sections are viewable" ON public.shelf_sections;
CREATE POLICY "Public shelf sections are viewable"
  ON public.shelf_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      JOIN public.profiles ON profiles.user_id = shelves.user_id
      WHERE shelves.id = shelf_sections.shelf_id AND profiles.is_public = true
    )
  );

DROP POLICY IF EXISTS "Public shelf books are viewable" ON public.shelf_books;
CREATE POLICY "Public shelf books are viewable"
  ON public.shelf_books FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      JOIN public.profiles ON profiles.user_id = shelves.user_id
      WHERE shelves.id = shelf_books.shelf_id AND profiles.is_public = true
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 5. Newsletters (from 00010_newsletters.sql)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.newsletter_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subscriber_user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  UNIQUE (author_id, subscriber_user_id)
);

ALTER TABLE public.newsletter_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletter_subscriptions' AND policyname = 'newsletter_subscriptions_select_author') THEN
    CREATE POLICY "newsletter_subscriptions_select_author" ON public.newsletter_subscriptions FOR SELECT USING (auth.uid() = author_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletter_subscriptions' AND policyname = 'newsletter_subscriptions_select_subscriber') THEN
    CREATE POLICY "newsletter_subscriptions_select_subscriber" ON public.newsletter_subscriptions FOR SELECT USING (auth.uid() = subscriber_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletter_subscriptions' AND policyname = 'newsletter_subscriptions_insert') THEN
    CREATE POLICY "newsletter_subscriptions_insert" ON public.newsletter_subscriptions FOR INSERT WITH CHECK (auth.uid() = subscriber_user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletter_subscriptions' AND policyname = 'newsletter_subscriptions_update') THEN
    CREATE POLICY "newsletter_subscriptions_update" ON public.newsletter_subscriptions FOR UPDATE USING (auth.uid() = subscriber_user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  sent_at TIMESTAMPTZ,
  recipient_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletters' AND policyname = 'newsletters_select') THEN
    CREATE POLICY "newsletters_select" ON public.newsletters FOR SELECT USING (auth.uid() = author_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletters' AND policyname = 'newsletters_insert') THEN
    CREATE POLICY "newsletters_insert" ON public.newsletters FOR INSERT WITH CHECK (auth.uid() = author_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletters' AND policyname = 'newsletters_update') THEN
    CREATE POLICY "newsletters_update" ON public.newsletters FOR UPDATE USING (auth.uid() = author_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'newsletters' AND policyname = 'newsletters_delete') THEN
    CREATE POLICY "newsletters_delete" ON public.newsletters FOR DELETE USING (auth.uid() = author_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_newsletter_subs_author ON public.newsletter_subscriptions (author_id, status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subs_subscriber ON public.newsletter_subscriptions (subscriber_user_id);
CREATE INDEX IF NOT EXISTS idx_newsletters_author ON public.newsletters (author_id, created_at DESC);
