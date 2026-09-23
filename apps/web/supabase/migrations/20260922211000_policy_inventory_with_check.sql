-- policy_inventory previously returned only USING (qual). INSERT and UPDATE
-- holes live in WITH CHECK, so the paywall script could not see them.
-- Return type changes, so the function has to be dropped before it is recreated.

DROP FUNCTION IF EXISTS public.policy_inventory(text);

CREATE FUNCTION public.policy_inventory(p_table text)
RETURNS TABLE (
  policyname text,
  cmd text,
  permissive text,
  roles text[],
  qual text,
  with_check text
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
    p.qual::text,
    p.with_check::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = $1
  ORDER BY p.cmd, p.policyname;
$$;

REVOKE ALL ON FUNCTION public.policy_inventory(text) FROM public;
REVOKE ALL ON FUNCTION public.policy_inventory(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.policy_inventory(text) TO service_role;

COMMENT ON FUNCTION public.policy_inventory(text) IS
  'Policies actually on this table, including WITH CHECK, for check scripts. service_role only.';
