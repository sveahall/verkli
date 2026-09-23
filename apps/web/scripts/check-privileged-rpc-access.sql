-- Read-only release check; never invokes the business functions being checked.
-- From apps/web: supabase db query --linked --file scripts/check-privileged-rpc-access.sql
-- Or: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-privileged-rpc-access.sql
-- This checks the listed access boundaries, not payment behavior or all database policies.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  signature text;
  function_id oid;
  client_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION '[security permissions] missing service role';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      RAISE EXCEPTION '[security permissions] missing client role: %', client_role;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_roles
      WHERE rolname = client_role AND (rolsuper OR rolbypassrls)
    ) THEN
      RAISE EXCEPTION '[security permissions] client role bypass: %', client_role;
    END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public.finalize_order_checkout_session(text)',
    'public.finalize_donation_checkout_session(text)',
    'public.finalize_credit_topup_checkout_session(text)',
    'public.grant_user_credits_once(uuid,integer,text,uuid)',
    'public.revoke_order_for_refund(text,text)',
    'public.upsert_author_subscription(uuid,uuid,text,text,integer,text,text,timestamptz,timestamptz)',
    'public.update_author_subscription_status(text,text,timestamptz,timestamptz)',
    'public.dm_consume_rate_limit(uuid,integer,integer)',
    'public.refresh_book_audiobook_status(uuid)'
  ] LOOP
    function_id := to_regprocedure(signature);
    IF function_id IS NULL THEN
      RAISE EXCEPTION '[security permissions] missing function: %', signature;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(client_role, function_id, 'EXECUTE') THEN
        RAISE EXCEPTION '[security permissions] client execution: % on %', client_role, signature;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', function_id, 'EXECUTE') THEN
      RAISE EXCEPTION '[security permissions] missing service execution: %', signature;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = to_regclass('public.author_subscriptions') AND relrowsecurity
  ) THEN
    RAISE EXCEPTION '[security permissions] missing subscription table or row security';
  END IF;

  -- RLS does not protect an unforced table from its owner or an inherited owner.
  IF EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid = to_regclass('public.author_subscriptions')
      AND NOT c.relforcerowsecurity
      AND (pg_has_role('anon', c.relowner, 'USAGE')
        OR pg_has_role('authenticated', c.relowner, 'USAGE'))
  ) THEN
    RAISE EXCEPTION '[security permissions] client role bypass through subscription table ownership';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy p
    CROSS JOIN LATERAL unnest(p.polroles) AS policy_role(role_id)
    WHERE p.polrelid = to_regclass('public.author_subscriptions')
      AND p.polpermissive
      AND p.polcmd IN ('*', 'a', 'w', 'd')
      AND CASE WHEN policy_role.role_id = 0 THEN true
        ELSE pg_has_role('anon', policy_role.role_id, 'USAGE')
          OR pg_has_role('authenticated', policy_role.role_id, 'USAGE')
        END
  ) THEN
    RAISE EXCEPTION '[security permissions] client subscription write policy exists';
  END IF;
END;
$$;

SELECT 'privileged-rpc-access: PASS' AS result, now() AS checked_at;
ROLLBACK;
