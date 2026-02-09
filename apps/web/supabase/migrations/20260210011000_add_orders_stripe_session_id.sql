-- Store Stripe Checkout session id for webhook reconciliation.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_session_id_unique_idx
  ON public.orders (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

COMMENT ON COLUMN public.orders.stripe_session_id IS 'Stripe Checkout session id (cs_*) linked to the order.';
