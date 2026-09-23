-- BUGFIX: free books with NULL currency should not break pricing APIs.
-- Keep price_amount unchanged; only backfill missing currency for free rows.

UPDATE public.books
SET price_currency = 'USD'
WHERE (price_amount IS NULL OR price_amount = 0)
  AND price_currency IS NULL;
