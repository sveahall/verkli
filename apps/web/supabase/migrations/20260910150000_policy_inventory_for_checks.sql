-- Lets a check script see what policies a table ACTUALLY has.
--
-- The paywall bug (20260910120000 -> 130000) was invisible for one reason:
-- there is no way to ask production "what policies are on this table?" from
-- outside psql. `pg_policies` is a system view PostgREST does not expose, so
-- every answer came from reading migrations — and the two policies that
-- mattered were written in the dashboard and appear in no migration. A green
-- `db push` of a correct policy sat next to a hand-written one that OR'd it
-- open, and nothing in the repo could tell.
--
-- This is the missing observability, not a feature. `npm run check:rls-paywall`
-- calls it and fails when `chapters` has more than one PERMISSIVE SELECT
-- policy, which is the exact condition that reopens the paywall.
--
-- Read-only and service-role only. Policy expressions describe how access is
-- gated, so they are not something to hand to anon or authenticated; EXECUTE
-- is revoked from both. SECURITY DEFINER because pg_policies shows a caller
-- only the policies on tables it owns.

CREATE OR REPLACE FUNCTION public.policy_inventory(p_table text)
RETURNS TABLE (
  policyname text,
  cmd text,
  permissive text,
  roles text[],
  qual text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
STABLE
AS $$
  SELECT
    p.policyname::text,
    p.cmd::text,
    p.permissive::text,
    p.roles::text[],
    p.qual::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = $1
  ORDER BY p.cmd, p.policyname;
$$;

REVOKE ALL ON FUNCTION public.policy_inventory(text) FROM public;
REVOKE ALL ON FUNCTION public.policy_inventory(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.policy_inventory(text) TO service_role;

COMMENT ON FUNCTION public.policy_inventory(text) IS
  'What policies are really on this table, for check scripts. service_role only — policy expressions describe the access gates themselves. Exists because the paywall was reopened by dashboard-written policies that no migration mentions and nothing outside psql could see.';
