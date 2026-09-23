-- Billing accounts: one row per (user_id, role). Role-scoped.
-- Reader and author subscriptions are stored separately.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_role') THEN
    CREATE TYPE public.billing_role AS ENUM ('reader', 'author');
  END IF;
END
$$;

-- Add role (nullable until backfill); use enum so type matches on all envs
ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS role public.billing_role;

-- Backfill role from plan: plus -> reader, pro -> author, else reader
UPDATE public.billing_accounts
SET role = (
  CASE
    WHEN plan = 'pro' THEN 'author'
    WHEN plan = 'plus' THEN 'reader'
    ELSE 'reader'
  END
)::public.billing_role
WHERE role IS NULL;

-- Enforce role NOT NULL and valid values
ALTER TABLE public.billing_accounts
  ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.billing_accounts
  DROP CONSTRAINT IF EXISTS billing_accounts_role_check;
ALTER TABLE public.billing_accounts
  ADD CONSTRAINT billing_accounts_role_check CHECK (role IN ('reader', 'author'));

-- Drop old primary key and unique indexes that conflict with multi-row-per-user
ALTER TABLE public.billing_accounts DROP CONSTRAINT IF EXISTS billing_accounts_pkey;

-- stripe_customer_id no longer unique: same Stripe customer can have reader + author rows
ALTER TABLE public.billing_accounts DROP CONSTRAINT IF EXISTS billing_accounts_stripe_customer_id_key;

-- subscription_id: drop constraint (backed by index), then recreate as partial unique index
ALTER TABLE public.billing_accounts DROP CONSTRAINT IF EXISTS billing_accounts_stripe_subscription_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS billing_accounts_stripe_subscription_id_key
  ON public.billing_accounts (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Composite primary key: one row per (user_id, role)
ALTER TABLE public.billing_accounts
  ADD PRIMARY KEY (user_id, role);

-- RLS unchanged: users still select by user_id (auth.uid() = user_id)
-- Existing policy billing_accounts_select_own continues to work.