-- Annual billing: one catalog row per (role, plan, interval).
--
-- The table held one row per (provider, role, plan_key), so a plan could only
-- ever have a single price and the annual toggle on the pricing page changed
-- the displayed figure without changing what was charged.
--
-- Existing rows are all monthly, which is why the default is 'month' and the
-- column is NOT NULL from the start — no backfill step, no nullable window.

alter table public.billing_plan_catalog
  add column if not exists interval text not null default 'month';

alter table public.billing_plan_catalog
  drop constraint if exists billing_plan_catalog_interval_check;

alter table public.billing_plan_catalog
  add constraint billing_plan_catalog_interval_check
  check (interval in ('month', 'year'));

-- The old key is what blocks a second row per plan; the new one keeps the same
-- guarantee one level deeper, so a plan still cannot have two monthly prices.
alter table public.billing_plan_catalog
  drop constraint if exists billing_plan_catalog_provider_role_plan_key_key;

alter table public.billing_plan_catalog
  add constraint billing_plan_catalog_provider_role_plan_interval_key
  unique (provider, role, plan_key, interval);
