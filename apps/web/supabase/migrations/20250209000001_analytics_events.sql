-- FAS 5: analytics_events for funnel metrics (if not already present from FAS 2)

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  path text,
  props jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON public.analytics_events(created_at);
CREATE INDEX IF NOT EXISTS analytics_events_event_name_idx ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS analytics_events_path_idx ON public.analytics_events(path);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- No permissive policies: anon/key cannot access; service role bypasses RLS for ingestion and admin funnel.

COMMENT ON TABLE public.analytics_events IS 'Server-side events for funnel; RLS on, service role only';
