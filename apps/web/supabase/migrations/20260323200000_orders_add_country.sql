-- Add country column to orders for sales-by-country analytics
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS country text;

COMMENT ON COLUMN public.orders.country IS 'ISO 3166-1 alpha-2 country code of the buyer (e.g. SE, US). Populated from Stripe session data at checkout.';

CREATE INDEX IF NOT EXISTS orders_country_idx ON public.orders (country) WHERE country IS NOT NULL;
