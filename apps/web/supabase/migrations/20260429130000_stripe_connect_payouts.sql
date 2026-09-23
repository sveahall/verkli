-- ---------------------------------------------------------------------------
-- Stripe Connect Express payouts (Week 1 of pre-raise plan, ROADMAP Phase 0.1).
--
-- Each author has at most one Connect account. We store the minimum needed to
-- gate publishing on `payouts_enabled = true` and to render the ledger /
-- onboarding state.
--
-- Source of truth is Stripe; this row is a denormalised cache updated by:
--   - the onboard route on first-create
--   - the `account.updated` webhook handler thereafter
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_payout_accounts (
  user_id              uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id    text        NOT NULL UNIQUE,
  country              text        NOT NULL,
  payouts_enabled      boolean     NOT NULL DEFAULT false,
  charges_enabled      boolean     NOT NULL DEFAULT false,
  details_submitted    boolean     NOT NULL DEFAULT false,
  capabilities         jsonb,
  requirements         jsonb,
  payout_schedule      text        NOT NULL DEFAULT 'monthly'
                         CHECK (payout_schedule IN ('weekly', 'monthly')),
  default_currency     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS author_payout_accounts_stripe_account_idx
  ON public.author_payout_accounts (stripe_account_id);

CREATE INDEX IF NOT EXISTS author_payout_accounts_payouts_enabled_idx
  ON public.author_payout_accounts (user_id) WHERE payouts_enabled = true;

DROP TRIGGER IF EXISTS update_author_payout_accounts_updated_at ON public.author_payout_accounts;
CREATE TRIGGER update_author_payout_accounts_updated_at
  BEFORE UPDATE ON public.author_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.author_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Author can read their own row.
DROP POLICY IF EXISTS "Author reads own payout account" ON public.author_payout_accounts;
CREATE POLICY "Author reads own payout account"
  ON public.author_payout_accounts
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT and UPDATE are service-role only — onboard route + webhook handler
-- both use the admin client. This intentionally blocks user-side writes so
-- the row stays in lockstep with Stripe.

-- Admin can read all rows for support / ledger analytics.
DROP POLICY IF EXISTS "Admin reads all payout accounts" ON public.author_payout_accounts;
CREATE POLICY "Admin reads all payout accounts"
  ON public.author_payout_accounts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND lower(coalesce(p.role, '')) = 'admin'
    )
  );

-- rollback:
--   DROP TABLE IF EXISTS public.author_payout_accounts;
