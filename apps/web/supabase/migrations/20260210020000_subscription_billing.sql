-- Subscription billing foundation for Verkli Plus/Pro.
-- Adds account state, webhook idempotency log, and user credit balance.

CREATE TABLE IF NOT EXISTS public.billing_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  plan text CHECK (plan IN ('plus', 'pro')),
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_billing_accounts_updated_at ON public.billing_accounts;
CREATE TRIGGER update_billing_accounts_updated_at
  BEFORE UPDATE ON public.billing_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_accounts_select_own ON public.billing_accounts;
CREATE POLICY billing_accounts_select_own ON public.billing_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.stripe_events (
  stripe_event_id text NOT NULL UNIQUE,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_balance integer NOT NULL DEFAULT 0
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_credits_select_own ON public.user_credits;
CREATE POLICY user_credits_select_own ON public.user_credits
  FOR SELECT
  USING (auth.uid() = user_id);
