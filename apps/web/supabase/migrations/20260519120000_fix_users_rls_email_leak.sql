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
