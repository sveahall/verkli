-- Monthly per-user usage counters for feature guardrails (e.g. trailer generation).

CREATE TABLE IF NOT EXISTS public.user_usage_monthly (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_month date NOT NULL,
  trailer_count_this_month integer NOT NULL DEFAULT 0 CHECK (trailer_count_this_month >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, usage_month)
);

CREATE INDEX IF NOT EXISTS user_usage_monthly_usage_month_idx
  ON public.user_usage_monthly (usage_month DESC);

DROP TRIGGER IF EXISTS update_user_usage_monthly_updated_at ON public.user_usage_monthly;
CREATE TRIGGER update_user_usage_monthly_updated_at
  BEFORE UPDATE ON public.user_usage_monthly
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_usage_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_usage_monthly_select_own ON public.user_usage_monthly;
CREATE POLICY user_usage_monthly_select_own ON public.user_usage_monthly
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_usage_monthly IS 'Monthly usage counters per user for cost guardrails.';
COMMENT ON COLUMN public.user_usage_monthly.usage_month IS 'First day (UTC month bucket) used as monthly counter key.';
