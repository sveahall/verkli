-- Align subscription billing tables with production schema requirements.
-- Canonical CREATE TABLE lives in 20260210020000_subscription_billing.sql.
-- This migration only aligns existing schema.

ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.billing_accounts
  ALTER COLUMN stripe_customer_id DROP NOT NULL,
  ALTER COLUMN stripe_subscription_id DROP NOT NULL,
  ALTER COLUMN plan DROP NOT NULL,
  ALTER COLUMN status DROP NOT NULL,
  ALTER COLUMN current_period_end DROP NOT NULL,
  ALTER COLUMN cancel_at_period_end SET DEFAULT false,
  ALTER COLUMN cancel_at_period_end SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.billing_accounts
  DROP CONSTRAINT IF EXISTS billing_accounts_plan_check;

CREATE UNIQUE INDEX IF NOT EXISTS billing_accounts_stripe_customer_id_key
  ON public.billing_accounts (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_accounts_stripe_subscription_id_key
  ON public.billing_accounts (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_billing_accounts_updated_at ON public.billing_accounts;
CREATE TRIGGER update_billing_accounts_updated_at
  BEFORE UPDATE ON public.billing_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_accounts_select_own ON public.billing_accounts;
CREATE POLICY billing_accounts_select_own ON public.billing_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS stripe_event_id text,
  ADD COLUMN IF NOT EXISTS type text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.stripe_events
  ALTER COLUMN stripe_event_id SET NOT NULL,
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN received_at SET DEFAULT now(),
  ALTER COLUMN received_at SET NOT NULL;

ALTER TABLE public.stripe_events
  DROP COLUMN IF EXISTS payload;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.stripe_events'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.stripe_events
      ADD CONSTRAINT stripe_events_pkey PRIMARY KEY (stripe_event_id);
  END IF;
END
$$;

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_credits
  ADD COLUMN IF NOT EXISTS token_balance int NOT NULL DEFAULT 0;

ALTER TABLE public.user_credits
  ALTER COLUMN token_balance SET DEFAULT 0,
  ALTER COLUMN token_balance SET NOT NULL;

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_credits_select_own ON public.user_credits;
CREATE POLICY user_credits_select_own ON public.user_credits
  FOR SELECT
  USING (auth.uid() = user_id);
