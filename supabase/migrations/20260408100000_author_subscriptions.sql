-- Author subscription plans: each author can configure one plan
CREATE TABLE IF NOT EXISTS public.author_subscription_plans (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled      boolean     NOT NULL DEFAULT false,
  price_monthly integer    NOT NULL DEFAULT 4900,  -- minor units (e.g. SEK öre)
  currency     text        NOT NULL DEFAULT 'sek',
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_id)
);

-- Reader subscriptions to authors
CREATE TABLE IF NOT EXISTS public.author_subscriptions (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status                text        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete')),
  amount_monthly        integer     NOT NULL,
  currency              text        NOT NULL DEFAULT 'sek',
  stripe_subscription_id text       UNIQUE,
  stripe_customer_id    text,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  canceled_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscriber_user_id, author_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS author_subscriptions_author_id_status_idx
  ON public.author_subscriptions (author_id, status);
CREATE INDEX IF NOT EXISTS author_subscriptions_subscriber_idx
  ON public.author_subscriptions (subscriber_user_id, status);
CREATE INDEX IF NOT EXISTS author_subscriptions_stripe_sub_id_idx
  ON public.author_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- RLS
ALTER TABLE public.author_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_subscriptions ENABLE ROW LEVEL SECURITY;

-- Plans: author can manage their own plan
CREATE POLICY "Author manages own plan"
  ON public.author_subscription_plans
  FOR ALL
  USING (auth.uid() = author_id);

-- Plans: anyone authenticated can read enabled plans
CREATE POLICY "Authenticated can read enabled plans"
  ON public.author_subscription_plans
  FOR SELECT
  USING (enabled = true);

-- Subscriptions: subscriber can see/manage own subscriptions
CREATE POLICY "Subscriber owns their subscriptions"
  ON public.author_subscriptions
  FOR ALL
  USING (auth.uid() = subscriber_user_id);

-- Subscriptions: author can read their own subscriber list
CREATE POLICY "Author reads own subscriber list"
  ON public.author_subscriptions
  FOR SELECT
  USING (auth.uid() = author_id);

-- Function: upsert author subscription from webhook (service role only)
CREATE OR REPLACE FUNCTION public.upsert_author_subscription(
  p_subscriber_user_id    uuid,
  p_author_id             uuid,
  p_stripe_subscription_id text,
  p_stripe_customer_id    text,
  p_amount_monthly        integer,
  p_currency              text,
  p_status                text,
  p_current_period_start  timestamptz DEFAULT NULL,
  p_current_period_end    timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.author_subscriptions (
    subscriber_user_id,
    author_id,
    stripe_subscription_id,
    stripe_customer_id,
    amount_monthly,
    currency,
    status,
    current_period_start,
    current_period_end,
    updated_at
  ) VALUES (
    p_subscriber_user_id,
    p_author_id,
    p_stripe_subscription_id,
    p_stripe_customer_id,
    p_amount_monthly,
    p_currency,
    p_status,
    p_current_period_start,
    p_current_period_end,
    now()
  )
  ON CONFLICT (subscriber_user_id, author_id)
  DO UPDATE SET
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_customer_id     = EXCLUDED.stripe_customer_id,
    amount_monthly         = EXCLUDED.amount_monthly,
    currency               = EXCLUDED.currency,
    status                 = EXCLUDED.status,
    current_period_start   = COALESCE(EXCLUDED.current_period_start, author_subscriptions.current_period_start),
    current_period_end     = COALESCE(EXCLUDED.current_period_end, author_subscriptions.current_period_end),
    updated_at             = now();
END;
$$;

-- Function: update author subscription status by stripe_subscription_id
CREATE OR REPLACE FUNCTION public.update_author_subscription_status(
  p_stripe_subscription_id  text,
  p_status                  text,
  p_current_period_end      timestamptz DEFAULT NULL,
  p_canceled_at             timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.author_subscriptions
  SET
    status               = p_status,
    current_period_end   = COALESCE(p_current_period_end, current_period_end),
    canceled_at          = COALESCE(p_canceled_at, canceled_at),
    updated_at           = now()
  WHERE stripe_subscription_id = p_stripe_subscription_id;
END;
$$;
