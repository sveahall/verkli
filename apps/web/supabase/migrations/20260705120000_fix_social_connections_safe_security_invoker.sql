-- ============================================================================
-- Fix: social_connections_safe leaked every user's connections (Supabase
--      Security Advisor: "Security Definer View", severity CRITICAL).
--
-- The view was created without `security_invoker`, so on Postgres 15+ it runs
-- with the view owner's privileges and BYPASSES row-level security on the base
-- table `public.social_connections`. The API route
-- (api/social/connections/route.ts) selects from the view with the caller's
-- authenticated client and NO explicit user_id filter — it relies entirely on
-- RLS to scope rows. With RLS bypassed, any pro user reads every user's social
-- connections (platform, handle, status, token expiry, timestamps). The
-- encrypted token columns stay hidden, but the connection metadata leaked.
--
-- The base table already has the correct policy:
--   social_connections_select_own: FOR SELECT USING (auth.uid() = user_id)
--
-- Setting security_invoker = on makes the view execute as the querying user, so
-- that policy applies and each user sees only their own rows — which is exactly
-- what the view's own comment already claimed ("RLS from base table applies").
-- Same pattern already used by job_status_view (20260208010000).
--
-- ALTER VIEW ... SET is used (not CREATE OR REPLACE) so the live column set is
-- preserved untouched; this change is purely the security_invoker option.
-- ============================================================================

ALTER VIEW public.social_connections_safe SET (security_invoker = on);

COMMENT ON VIEW public.social_connections_safe IS
  'Safe projection of social_connections – no encrypted token columns. '
  'security_invoker=on so the base table''s RLS (select own rows) is enforced.';
