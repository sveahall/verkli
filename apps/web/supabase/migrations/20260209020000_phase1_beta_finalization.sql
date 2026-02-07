-- Phase 1 Beta finalization
-- 1) Author approval v1
-- 2) Core analytics v1 field alignment

-- ---------------------------------------------------------------------------
-- Author approval v1
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.author_applications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS author_applications_status_idx
  ON public.author_applications(status);

ALTER TABLE public.author_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS author_applications_select_own ON public.author_applications;
CREATE POLICY author_applications_select_own ON public.author_applications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS author_applications_insert_own ON public.author_applications;
CREATE POLICY author_applications_insert_own ON public.author_applications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.author_applications IS 'Reader -> author approval workflow. pending/approved/rejected.';

-- ---------------------------------------------------------------------------
-- Core analytics v1 alignment
-- ---------------------------------------------------------------------------
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS book_id uuid REFERENCES public.books(id) ON DELETE SET NULL;

UPDATE public.analytics_events
SET event_type = event_name
WHERE event_type IS NULL
  AND event_name IS NOT NULL;

ALTER TABLE public.analytics_events
  ALTER COLUMN event_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_events_event_type_idx
  ON public.analytics_events(event_type);

CREATE INDEX IF NOT EXISTS analytics_events_book_id_idx
  ON public.analytics_events(book_id);

COMMENT ON COLUMN public.analytics_events.event_type IS 'Canonical analytics event type (e.g. book_view, start_reading, purchase_attempt, purchase_completed).';
COMMENT ON COLUMN public.analytics_events.book_id IS 'Book reference when event is tied to a specific title.';
