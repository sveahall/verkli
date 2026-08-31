-- ===========================================================================
-- NO-OP AS OF 2026-08-31 on every database we have, and now guarded so it says
-- so in SQL rather than in a comment.
--
-- `public.users` does not exist. Verified three ways: PostgREST returns
-- PGRST205 for it even with the service-role key, it has no entry in the
-- generated src/lib/supabase/types.ts, and nothing in apps/web/src references
-- it. So the leak described below is not open — there is no table to leak from.
--
-- The original body was also unrunnable, which is the part that mattered:
-- `DROP POLICY IF EXISTS ... ON public.users` aborts on the missing relation,
-- because IF EXISTS guards the policy, not the table. That would have broken
-- `supabase db reset` for everyone, not just this migration. It is now wrapped
-- in an existence check and uses EXECUTE so the table name is resolved at run
-- time rather than when the block is compiled.
--
-- Kept rather than deleted because it records a real decision: public profile
-- data belongs in public.profiles behind its own `is_public` gating, and a
-- world-readable users mirror is not something to reintroduce. If a
-- public.users table is ever added, this migration starts doing its job.
-- ===========================================================================

-- Fix: public.users SELECT policy exposed email addresses to anon/auth roles.
--
-- The original policy "Users are viewable by everyone" used USING (true),
-- meaning anyone holding the Supabase anon key could `select email from
-- public.users` and enumerate every registered user. Public profile data
-- (display_name, username, avatarUrl) lives in public.profiles and has its
-- own RLS gating via `is_public`; the public.users mirror table is only
-- needed for admin tooling that uses the service-role client (which
-- bypasses RLS).
--
-- This migration replaces the open policy with a self-only SELECT policy.
-- Admin routes that read public.users continue to work because they use
-- createAdminClient() which uses the service-role key.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'users' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'public.users does not exist; nothing to fix.';
    RETURN;
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'users'
       AND policyname = 'Users can view own row'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own row" ON public.users FOR SELECT USING (auth.uid() = id)';
  END IF;
END $$;
