ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS print_on_demand_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.books.print_on_demand_settings IS
  'Print-on-demand settings persisted from the author editor: enabled, formats, editionLimit, limitCount and isbn.';
