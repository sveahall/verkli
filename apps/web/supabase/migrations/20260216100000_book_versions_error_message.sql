-- Store translation (and other version) failure reason for display in UI.
ALTER TABLE public.book_versions
  ADD COLUMN IF NOT EXISTS error_message text;

COMMENT ON COLUMN public.book_versions.error_message IS 'Error message when status is failed (e.g. translation worker failure).';
