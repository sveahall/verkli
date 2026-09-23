-- Track wizard completion state per book (UI navigation metadata, not queried).
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS setup_state jsonb DEFAULT NULL;
