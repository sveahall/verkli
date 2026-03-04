-- Create shelves, shelf_sections, and shelf_books tables
-- This migration creates the library structure for organizing books

-- ─────────────────────────────────────────────────────────────
-- Shelves
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shelves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subtitle TEXT,
  cover_url TEXT,
  cover_type TEXT DEFAULT 'image' CHECK (cover_type IN ('image', 'gradient')),
  cover_gradient TEXT, -- JSON string for gradient config
  typography JSONB DEFAULT '{}'::jsonb, -- { fontFamily, fontWeight, titleSize, subtitleSize, textColor }
  sort_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT shelves_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shelves_user_id_idx ON public.shelves(user_id);
CREATE INDEX IF NOT EXISTS shelves_sort_index_idx ON public.shelves(user_id, sort_index);

-- ─────────────────────────────────────────────────────────────
-- Shelf Sections
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shelf_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id UUID NOT NULL REFERENCES public.shelves(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT shelf_sections_shelf_id_fkey FOREIGN KEY (shelf_id) REFERENCES public.shelves(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS shelf_sections_shelf_id_idx ON public.shelf_sections(shelf_id);
CREATE INDEX IF NOT EXISTS shelf_sections_sort_index_idx ON public.shelf_sections(shelf_id, sort_index);

-- ─────────────────────────────────────────────────────────────
-- Shelf Books (junction table)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shelf_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shelf_id UUID NOT NULL REFERENCES public.shelves(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.shelf_sections(id) ON DELETE SET NULL,
  sort_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT shelf_books_shelf_id_fkey FOREIGN KEY (shelf_id) REFERENCES public.shelves(id) ON DELETE CASCADE,
  CONSTRAINT shelf_books_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE,
  CONSTRAINT shelf_books_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.shelf_sections(id) ON DELETE SET NULL,
  CONSTRAINT shelf_books_unique UNIQUE (shelf_id, book_id)
);

CREATE INDEX IF NOT EXISTS shelf_books_shelf_id_idx ON public.shelf_books(shelf_id);
CREATE INDEX IF NOT EXISTS shelf_books_book_id_idx ON public.shelf_books(book_id);
CREATE INDEX IF NOT EXISTS shelf_books_section_id_idx ON public.shelf_books(section_id);
CREATE INDEX IF NOT EXISTS shelf_books_sort_index_idx ON public.shelf_books(shelf_id, section_id, sort_index);

-- ─────────────────────────────────────────────────────────────
-- RLS Policies
-- ─────────────────────────────────────────────────────────────

-- Shelves
ALTER TABLE public.shelves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shelves"
  ON public.shelves FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own shelves"
  ON public.shelves FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own shelves"
  ON public.shelves FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own shelves"
  ON public.shelves FOR DELETE
  USING (auth.uid() = user_id);

-- Shelf Sections
ALTER TABLE public.shelf_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sections in own shelves"
  ON public.shelf_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      WHERE shelves.id = shelf_sections.shelf_id
      AND shelves.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create sections in own shelves"
  ON public.shelf_sections FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shelves
      WHERE shelves.id = shelf_sections.shelf_id
      AND shelves.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update sections in own shelves"
  ON public.shelf_sections FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      WHERE shelves.id = shelf_sections.shelf_id
      AND shelves.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sections in own shelves"
  ON public.shelf_sections FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      WHERE shelves.id = shelf_sections.shelf_id
      AND shelves.user_id = auth.uid()
    )
  );

-- Shelf Books
ALTER TABLE public.shelf_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view books in own shelves"
  ON public.shelf_books FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      WHERE shelves.id = shelf_books.shelf_id
      AND shelves.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add books to own shelves"
  ON public.shelf_books FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shelves
      WHERE shelves.id = shelf_books.shelf_id
      AND shelves.user_id = auth.uid()
    )
    AND (
      -- Book must belong to user OR be published
      EXISTS (
        SELECT 1 FROM public.books
        WHERE books.id = shelf_books.book_id
        AND (books.author_id = auth.uid() OR books.status = 'PUBLISHED')
      )
    )
  );

CREATE POLICY "Users can update books in own shelves"
  ON public.shelf_books FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      WHERE shelves.id = shelf_books.shelf_id
      AND shelves.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can remove books from own shelves"
  ON public.shelf_books FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.shelves
      WHERE shelves.id = shelf_books.shelf_id
      AND shelves.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Updated_at triggers
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shelves_updated_at
  BEFORE UPDATE ON public.shelves
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shelf_sections_updated_at
  BEFORE UPDATE ON public.shelf_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shelf_books_updated_at
  BEFORE UPDATE ON public.shelf_books
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
