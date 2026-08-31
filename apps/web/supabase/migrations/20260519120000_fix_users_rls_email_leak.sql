-- ===========================================================================
-- MOOT 2026-08-31 — DO NOT APPLY. Recorded as done in the migration ledger so
-- `supabase db push` never attempts it.
--
-- `public.users` does not exist. Verified three ways on 2026-08-31: PostgREST
-- returns PGRST205 for it even with the service-role key, it has no entry in
-- src/lib/supabase/types.ts (which is generated from the live database), and no
-- code in apps/web/src references it.
--
-- So the leak described below is not open — there is no table to leak from —
-- and this migration cannot run: `DROP POLICY ... ON public.users` errors with
-- "relation does not exist" (IF EXISTS covers the policy, not the table).
--
-- Kept rather than deleted because it records a real decision: public profile
-- data belongs in public.profiles behind its own `is_public` gating, and a
-- world-readable users mirror is not something to reintroduce. If a
-- public.users table is ever added, apply this policy shape with it.
-- ===========================================================================

-- Original content follows, kept as history. None of it runs.
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

DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can view own row'
  ) THEN
    CREATE POLICY "Users can view own row"
      ON public.users FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;
