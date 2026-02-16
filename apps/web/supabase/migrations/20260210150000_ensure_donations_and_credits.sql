-- Ensure donations/credit_topups/credit_grants exist when 20260210110000 was skipped on remote
-- (e.g. due to duplicate version). Idempotent; safe to run even if tables already exist.

CREATE TABLE IF NOT EXISTS public.donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  provider text NOT NULL DEFAULT 'stripe',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  credits_delta integer NOT NULL DEFAULT 0 CHECK (credits_delta >= 0),
  stripe_session_id text,
  paid_at timestamptz,
  credits_applied_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS donations_stripe_session_id_unique_idx
  ON public.donations (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS donations_user_created_idx
  ON public.donations (user_id, created_at DESC);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS donations_select_own ON public.donations;
CREATE POLICY donations_select_own ON public.donations
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.credit_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  credits_delta integer NOT NULL CHECK (credits_delta > 0),
  currency text NOT NULL,
  provider text NOT NULL DEFAULT 'stripe',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  stripe_session_id text,
  paid_at timestamptz,
  credits_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_topups_stripe_session_id_unique_idx
  ON public.credit_topups (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_topups_user_created_idx
  ON public.credit_topups (user_id, created_at DESC);

ALTER TABLE public.credit_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_topups_select_own ON public.credit_topups;
CREATE POLICY credit_topups_select_own ON public.credit_topups
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.credit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL CHECK (delta > 0),
  source text NOT NULL,
  source_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_grants_source_check'
      AND conrelid = 'public.credit_grants'::regclass
  ) THEN
    ALTER TABLE public.credit_grants
      ADD CONSTRAINT credit_grants_source_check
      CHECK (source IN ('donation', 'credit_topup', 'referral_redeemer', 'referral_referrer'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS credit_grants_user_created_idx
  ON public.credit_grants (user_id, created_at DESC);

ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.grant_user_credits_once(
  p_user_id uuid,
  p_delta integer,
  p_source text,
  p_source_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit_grant_id uuid;
BEGIN
  IF p_delta IS NULL OR p_delta <= 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.credit_grants (user_id, delta, source, source_id)
  VALUES (p_user_id, p_delta, p_source, p_source_id)
  ON CONFLICT (source, source_id) DO NOTHING
  RETURNING id INTO v_credit_grant_id;

  IF v_credit_grant_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.user_credits (user_id, token_balance)
  VALUES (p_user_id, p_delta)
  ON CONFLICT (user_id)
  DO UPDATE SET token_balance = public.user_credits.token_balance + EXCLUDED.token_balance;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_user_credits_once(uuid, integer, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_user_credits_once(uuid, integer, text, uuid) TO service_role;
