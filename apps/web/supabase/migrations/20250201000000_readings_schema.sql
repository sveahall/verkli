-- Readings table for reading progress
-- Creates table if not exists; adds chapter_id and progress_percent columns if missing

CREATE TABLE IF NOT EXISTS public.readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL,
  progress_percent INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);

CREATE INDEX IF NOT EXISTS readings_user_book_idx ON public.readings(user_id, book_id);

-- Add columns if table existed without them
ALTER TABLE public.readings ADD COLUMN IF NOT EXISTS chapter_id UUID REFERENCES public.chapters(id) ON DELETE SET NULL;
ALTER TABLE public.readings ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0;
