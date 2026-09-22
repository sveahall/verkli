-- Usage metering for the beta. Measures cost, never enforces it.
--
-- Raw units are stored alongside cost on purpose: provider prices change, and a
-- row holding only `cost_usd` cannot be repriced. A row holding
-- `quantity=41203, unit='input_tokens'` can be repriced forever.
--
-- Service-role only. Per-user spend is commercially sensitive and these tables
-- back no user-facing feature, so there is no reason for `anon` or
-- `authenticated` to hold any policy here at all.

CREATE TABLE IF NOT EXISTS public.usage_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  kind          text NOT NULL CHECK (kind IN ('ai_call','storage_snapshot','egress_grant','job')),
  provider      text,
  model         text,
  pipeline      text,
  quantity      bigint NOT NULL DEFAULT 0,
  unit          text NOT NULL,
  cost_usd      numeric(12,6),
  price_version text,
  book_id       uuid REFERENCES public.books(id) ON DELETE SET NULL,
  job_id        uuid REFERENCES public.ai_jobs(id) ON DELETE SET NULL,
  request_id    text,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS usage_events_user_time_idx
  ON public.usage_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_time_idx
  ON public.usage_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_pipeline_idx
  ON public.usage_events (pipeline, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.usage_daily (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day           date NOT NULL,
  pipeline      text NOT NULL DEFAULT '',
  provider      text NOT NULL DEFAULT '',
  unit          text NOT NULL,
  quantity_sum  bigint NOT NULL DEFAULT 0,
  cost_usd_sum  numeric(12,6) NOT NULL DEFAULT 0,
  event_count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, pipeline, provider, unit)
);

CREATE INDEX IF NOT EXISTS usage_daily_day_idx ON public.usage_daily (day DESC);

CREATE TABLE IF NOT EXISTS public.usage_price_book (
  version        text NOT NULL,
  provider       text NOT NULL,
  model          text NOT NULL,
  unit           text NOT NULL,
  usd_per_unit   numeric(16,10) NOT NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,
  PRIMARY KEY (version, provider, model, unit)
);

ALTER TABLE public.usage_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_price_book ENABLE ROW LEVEL SECURITY;

-- RLS enabled with zero policies = deny for anon and authenticated.
-- The service role bypasses RLS, which is the only access path we want.
--
-- Column privileges are revoked too, because RLS scopes the row and never the
-- field: `profiles.role` shipped readable to every client for exactly this
-- reason. A table with no policy still answers `count` requests through
-- PostgREST unless the grant itself is gone.
REVOKE ALL ON public.usage_events     FROM anon, authenticated;
REVOKE ALL ON public.usage_daily      FROM anon, authenticated;
REVOKE ALL ON public.usage_price_book FROM anon, authenticated;
