-- Harden payment-related RLS policies.
--
-- SECURITY FIX: Remove user-facing write policies on orders and entitlements.
-- All writes to these tables go through the admin/service-role client,
-- so user-facing policies are unnecessary and create exploit vectors:
--
-- 1) entitlements_insert_own allowed users to self-grant book access
--    without paying (direct INSERT via Supabase client).
--
-- 2) orders_update_own allowed users to flip order status to 'paid',
--    which combined with the early-return in confirmStripeBookPurchase()
--    created a full payment bypass.
--
-- 3) orders_insert_own is also removed since checkout uses admin client.
--    Keeping it would let users create orphan orders polluting the table.
--
-- After this migration, only service-role (admin client) can write to
-- orders and entitlements. Users retain SELECT on their own rows.

-- ── orders: drop INSERT and UPDATE, keep SELECT only ──────────────
DROP POLICY IF EXISTS orders_insert_own ON public.orders;
DROP POLICY IF EXISTS orders_update_own ON public.orders;

-- ── entitlements: drop INSERT, keep SELECT only ──────────────────
DROP POLICY IF EXISTS entitlements_insert_own ON public.entitlements;
