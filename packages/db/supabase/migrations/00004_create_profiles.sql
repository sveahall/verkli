-- Profiles table for public writer profiles

-- ─────────────────────────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  username TEXT UNIQUE,
  bio TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'writer' CHECK (role IN ('writer', 'reader')),
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

-- Updated_at trigger (reuses existing helper if present)
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────
-- Public read access for shelves when profile is public
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public shelves are viewable" ON public.shelves;
CREATE POLICY "Public shelves are viewable"
  ON public.shelves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = shelves.user_id
      AND profiles.is_public = true
    )
  );

DROP POLICY IF EXISTS "Public shelf sections are viewable" ON public.shelf_sections;
CREATE POLICY "Public shelf sections are viewable"
  ON public.shelf_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      JOIN public.profiles ON profiles.user_id = shelves.user_id
      WHERE shelves.id = shelf_sections.shelf_id
      AND profiles.is_public = true
    )
  );

DROP POLICY IF EXISTS "Public shelf books are viewable" ON public.shelf_books;
CREATE POLICY "Public shelf books are viewable"
  ON public.shelf_books FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      JOIN public.profiles ON profiles.user_id = shelves.user_id
      WHERE shelves.id = shelf_books.shelf_id
      AND profiles.is_public = true
    )
  );
