-- Security Hardening Round 3
-- Fixes: pod_orders payment bypass (M1), notification spoofing (M2), user email enumeration (M3)

-- ═══════════════════════════════════════════════════════════════
-- M1: Drop pod_orders INSERT/UPDATE — same vulnerability class
-- as orders/entitlements (fixed in 20260209030000). All writes
-- must go through server-side API using admin client.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.pod_orders') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can insert their own pod orders" ON public.pod_orders;
    DROP POLICY IF EXISTS "Users can update their own pod orders" ON public.pod_orders;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- M2: Notifications INSERT — remove actor_id clause that allows
-- cross-user notification spoofing. All cross-user notifications
-- (follows, purchases, etc.) are created server-side via admin client.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
CREATE POLICY notifications_insert_authenticated ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════
-- M3: Users table SELECT — restrict to own row only.
-- Prevents email enumeration by authenticated users.
-- Other user lookups should use the profiles table.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users are viewable by authenticated" ON public.users;
    CREATE POLICY "Users can view own row" ON public.users
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;
