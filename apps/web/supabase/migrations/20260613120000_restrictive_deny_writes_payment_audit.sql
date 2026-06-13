-- ---------------------------------------------------------------------------
-- P0 hardening — explicit RESTRICTIVE deny-write policies on money/audit tables.
--
-- Today, end-user writes to orders / entitlements / audit_log are blocked only
-- by the ABSENCE of permissive write policies (RLS default-deny). That is
-- correct but fragile: a future migration that adds a permissive INSERT/UPDATE
-- policy "for convenience" would silently re-open the payment-bypass class of
-- bug that 20260209030000_harden_payment_rls.sql closed.
--
-- This migration adds belt-and-suspenders RESTRICTIVE policies that deny
-- INSERT / UPDATE / DELETE to the `authenticated` and `anon` roles. RESTRICTIVE
-- policies are AND-ed with permissive ones, so even if a permissive write
-- policy is added later, these keep writes denied until someone deliberately
-- drops them.
--
-- IMPORTANT — why per-command and not FOR ALL:
--   A `FOR ALL ... USING (false)` restrictive policy would also AND against
--   SELECT and break legitimate reads (users reading their own orders /
--   entitlements; admins reading audit_log). We therefore scope strictly to
--   INSERT / UPDATE / DELETE and leave SELECT untouched.
--
-- The service-role client (createAdminClient) has BYPASSRLS, so all sanctioned
-- writes — Stripe webhook finalization, record_audit() SECURITY DEFINER, admin
-- tooling — continue to work unaffected.
--
-- Idempotent: every policy is dropped-if-exists before create.
--
-- rollback:
--   DROP POLICY IF EXISTS orders_deny_insert_clients      ON public.orders;
--   DROP POLICY IF EXISTS orders_deny_update_clients      ON public.orders;
--   DROP POLICY IF EXISTS orders_deny_delete_clients      ON public.orders;
--   DROP POLICY IF EXISTS entitlements_deny_insert_clients ON public.entitlements;
--   DROP POLICY IF EXISTS entitlements_deny_update_clients ON public.entitlements;
--   DROP POLICY IF EXISTS entitlements_deny_delete_clients ON public.entitlements;
--   DROP POLICY IF EXISTS audit_log_deny_insert_clients    ON public.audit_log;
--   DROP POLICY IF EXISTS audit_log_deny_update_clients    ON public.audit_log;
--   DROP POLICY IF EXISTS audit_log_deny_delete_clients    ON public.audit_log;
-- ---------------------------------------------------------------------------

-- ── orders ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS orders_deny_insert_clients ON public.orders;
CREATE POLICY orders_deny_insert_clients ON public.orders
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS orders_deny_update_clients ON public.orders;
CREATE POLICY orders_deny_update_clients ON public.orders
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS orders_deny_delete_clients ON public.orders;
CREATE POLICY orders_deny_delete_clients ON public.orders
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- ── entitlements ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS entitlements_deny_insert_clients ON public.entitlements;
CREATE POLICY entitlements_deny_insert_clients ON public.entitlements
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS entitlements_deny_update_clients ON public.entitlements;
CREATE POLICY entitlements_deny_update_clients ON public.entitlements
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS entitlements_deny_delete_clients ON public.entitlements;
CREATE POLICY entitlements_deny_delete_clients ON public.entitlements
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

-- ── audit_log (append-only; only record_audit() SECURITY DEFINER writes) ────
DROP POLICY IF EXISTS audit_log_deny_insert_clients ON public.audit_log;
CREATE POLICY audit_log_deny_insert_clients ON public.audit_log
  AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS audit_log_deny_update_clients ON public.audit_log;
CREATE POLICY audit_log_deny_update_clients ON public.audit_log
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS audit_log_deny_delete_clients ON public.audit_log;
CREATE POLICY audit_log_deny_delete_clients ON public.audit_log
  AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);
