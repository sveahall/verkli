-- RLS Policies för alla tabeller
-- Kör detta i Supabase SQL Editor efter Prisma migrate

-- ─────────────────────────────────────────────────────────────
-- Books
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Publicerade böcker kan ses av alla
CREATE POLICY "Published books are viewable by everyone"
  ON public.books FOR SELECT
  USING (status = 'PUBLISHED' OR "authorId" = auth.uid());

-- Författare kan skapa böcker
CREATE POLICY "Authors can create books"
  ON public.books FOR INSERT
  WITH CHECK (auth.uid() = "authorId");

-- Författare kan uppdatera sina egna böcker
CREATE POLICY "Authors can update own books"
  ON public.books FOR UPDATE
  USING (auth.uid() = "authorId");

-- Författare kan radera sina egna böcker
CREATE POLICY "Authors can delete own books"
  ON public.books FOR DELETE
  USING (auth.uid() = "authorId");

-- ─────────────────────────────────────────────────────────────
-- Chapters
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

-- Kapitel i publicerade böcker kan ses av alla
CREATE POLICY "Chapters of published books are viewable"
  ON public.chapters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.books
      WHERE books.id = chapters."bookId"
      AND (books.status = 'PUBLISHED' OR books."authorId" = auth.uid())
    )
  );

-- Författare kan hantera kapitel i sina böcker
CREATE POLICY "Authors can manage own chapters"
  ON public.chapters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.books
      WHERE books.id = chapters."bookId"
      AND books."authorId" = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Readings
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.readings ENABLE ROW LEVEL SECURITY;

-- Användare kan se sin egen läshistorik
CREATE POLICY "Users can view own readings"
  ON public.readings FOR SELECT
  USING (auth.uid() = "userId");

-- Användare kan skapa läshistorik
CREATE POLICY "Users can create readings"
  ON public.readings FOR INSERT
  WITH CHECK (auth.uid() = "userId");

-- Användare kan uppdatera sin läshistorik
CREATE POLICY "Users can update own readings"
  ON public.readings FOR UPDATE
  USING (auth.uid() = "userId");

-- ─────────────────────────────────────────────────────────────
-- Reviews
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Alla kan se recensioner
CREATE POLICY "Reviews are viewable by everyone"
  ON public.reviews FOR SELECT
  USING (true);

-- Användare kan skapa recensioner
CREATE POLICY "Users can create reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = "userId");

-- Användare kan uppdatera sina egna recensioner
CREATE POLICY "Users can update own reviews"
  ON public.reviews FOR UPDATE
  USING (auth.uid() = "userId");

-- Användare kan radera sina egna recensioner
CREATE POLICY "Users can delete own reviews"
  ON public.reviews FOR DELETE
  USING (auth.uid() = "userId");
