-- billing_plan_catalog is one table shared by every environment, and until now
-- it had no notion of which Stripe mode its price ids belonged to.
--
-- That is not a theoretical gap. The four rows held TEST price ids while
-- production ran a LIVE key, so every subscription checkout in production died
-- inside Stripe with `No such price` and surfaced as a generic 500. Repointing
-- the rows at live prices fixes production and breaks local development in
-- exactly the same way, because a developer's key is sk_test. One column of
-- state cannot serve two modes; there has to be a row per mode.
--
-- So: a livemode column, both sets of rows, and the reader picks the set that
-- matches the key it is holding (src/lib/billing/catalog.ts).
--
-- Existing rows now point at live prices, so `default true` describes them
-- correctly and there is no nullable window and no backfill step.

alter table public.billing_plan_catalog
  add column if not exists livemode boolean not null default true;

comment on column public.billing_plan_catalog.livemode is
  'Which Stripe mode this row''s price_id belongs to. true = sk_live, false = sk_test. Readers must filter on the mode of the key they hold; a cross-mode price id is a guaranteed checkout failure.';

-- The uniqueness guarantee moves one level deeper: a plan still cannot have two
-- monthly prices, but it may now have one per mode.
alter table public.billing_plan_catalog
  drop constraint if exists billing_plan_catalog_provider_role_plan_interval_key;

alter table public.billing_plan_catalog
  add constraint billing_plan_catalog_provider_role_plan_interval_livemode_key
  unique (provider, role, plan_key, interval, livemode);

-- The test-mode rows, so local development can reach checkout again. These are
-- the exact ids production used to point at, with the products they actually
-- belong to (prod_VAnC… are the test products; prod_Two… are the live ones).
--
-- Amounts match the live prices and the /pricing copy: $29/mo, $228/yr for
-- author Pro; $9/mo, $69/yr for reader Plus.
insert into public.billing_plan_catalog
  (provider, role, plan_key, price_id, product_id, interval, is_active, livemode)
values
  ('stripe', 'author', 'pro',  'price_1UARbnAqhHLEu2XKzUBN28Fp', 'prod_VAnCFQ7ZUqSssW', 'month', true, false),
  ('stripe', 'author', 'pro',  'price_1UARbnAqhHLEu2XKOYjWWa0x', 'prod_VAnCFQ7ZUqSssW', 'year',  true, false),
  ('stripe', 'reader', 'plus', 'price_1UARboAqhHLEu2XK9kcfjE1n', 'prod_VAnCWO88XkW4p4', 'month', true, false),
  ('stripe', 'reader', 'plus', 'price_1UARboAqhHLEu2XKrLrRNzQZ', 'prod_VAnCWO88XkW4p4', 'year',  true, false)
on conflict (provider, role, plan_key, interval, livemode) do update
  set price_id   = excluded.price_id,
      product_id = excluded.product_id,
      is_active  = excluded.is_active;
