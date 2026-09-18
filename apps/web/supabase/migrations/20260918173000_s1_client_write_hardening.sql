-- Approved by the project owner on 2026-09-18 after DATABASE-APPROVAL.md.
-- Reviewed source bodies below are preserved verbatim, including their historical
-- proposal-only comments. Run the complete migration in one transaction.
-- REVIEW PROPOSAL ONLY. Not an approved or applied migration.
-- Execute inside one explicit transaction only after approval and fresh inventory.
-- No existing account, manuscript, job, object or bucket is updated/deleted here.

DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION '[s1 database] Client role bypasses RLS; stop and review role configuration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
    WHERE r.rolname IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION '[s1 database] Unexpected inherited roles; review effective privileges first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE oid IN (
      'public.profiles'::regclass, 'public.ai_jobs'::regclass,
      'public.audiobook_assets'::regclass, 'public.chapter_audio_cache'::regclass,
      'storage.objects'::regclass
    ) AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION '[s1 database] RLS must be enabled on all five tables';
  END IF;
  IF (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a
      ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      WHERE a.attrelid='public.profiles'::regclass AND a.attname='role') IS DISTINCT FROM '''reader''::text'
    OR (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a
      ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      WHERE a.attrelid='public.profiles'::regclass AND a.attname='demo_mode') IS DISTINCT FROM 'false'
  THEN
    RAISE EXCEPTION '[s1 database] Safe profile defaults changed; stop and re-review';
  END IF;
END;
$preflight$;

-- A column REVOKE does not defeat a table-wide grant. Remove both layers,
-- including TRUNCATE/TRIGGER/REFERENCES (and MAINTAIN on PostgreSQL 17+).
-- service_role and object ownership are deliberately unchanged.
DO $privileges$
DECLARE
  table_name text;
  columns_sql text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['profiles','ai_jobs','audiobook_assets','chapter_audio_cache'] LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',table_name);
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns_sql
      FROM pg_attribute WHERE attrelid=format('public.%I',table_name)::regclass
      AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.%I FROM PUBLIC, anon, authenticated',columns_sql,table_name);
  END LOOP;
END;
$privileges$;

GRANT SELECT ON public.profiles,public.ai_jobs,public.audiobook_assets,public.chapter_audio_cache TO anon,authenticated;
-- Existing browser chapter cleanup uses own-job DELETE; retain current asset
-- owner DELETE as well. Their existing RLS policies remain the tenant boundary.
GRANT DELETE ON public.ai_jobs,public.audiobook_assets TO authenticated;
-- Explicit allowlist for existing cookie/browser profile upserts. user_id is
-- included for PostgREST ON CONFLICT; own-user USING/WITH CHECK prevents moves.
GRANT INSERT (
  user_id,display_name,avatar_url,cover_image,bio,is_public,website_url,social_links,
  preferences,username,age_verified_at,onboarding_completed_at,deletion_requested_at
), UPDATE (
  user_id,display_name,avatar_url,cover_image,bio,is_public,website_url,social_links,
  preferences,username,age_verified_at,onboarding_completed_at,deletion_requested_at
) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
DROP POLICY IF EXISTS ai_jobs_update_own ON public.ai_jobs;
DROP POLICY IF EXISTS audiobook_assets_insert ON public.audiobook_assets;
DROP POLICY IF EXISTS audiobook_assets_update ON public.audiobook_assets;
DROP POLICY IF EXISTS storage_audio_outputs_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS storage_content_assets_select_authenticated ON storage.objects;

-- auth.users.raw_user_meta_data is client-controlled, not an author approval.
-- Existing author/admin roles are preserved. New authors require the existing
-- admin approval/role-grant path in addition to beta_enabled. See README.
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles(user_id,display_name,avatar_url,role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name',NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url',
    'reader'
  ) ON CONFLICT(user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- REVIEW PROPOSAL ONLY. NOT APPROVED, NOT APPLIED, NOT A CANONICAL MIGRATION.
-- Add this to the reviewed S1 candidate, inside the SAME approved transaction
-- as its effective table+column INSERT/UPDATE/TRUNCATE privilege removal.
-- Do not apply this standalone while authenticated can still change kind.
-- No job rows, manuscript rows or existing service_role privileges are changed.

-- S1 hardening.sql:58 may retain authenticated DELETE on ai_jobs so the
-- existing browser chapter cleanup can remove ordinary own jobs.
-- Existing ai_jobs_delete_own remains the permissive ownership policy.
-- A restrictive condition is ANDed with all applicable permissive policies;
-- merely adding another permissive policy would NOT protect these rows.
DROP POLICY IF EXISTS ai_jobs_protect_translation_quality_delete ON public.ai_jobs;
CREATE POLICY ai_jobs_protect_translation_quality_delete
  ON public.ai_jobs
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (kind IS DISTINCT FROM 'translation_quality'::text);

COMMENT ON POLICY ai_jobs_protect_translation_quality_delete ON public.ai_jobs IS
  'Authors may retain existing own-job cleanup, but translation-quality receipts require service-controlled direct deletion. Parent FK cascades and authorized server deletion are separate lifecycle operations.';

-- No additional GRANT is proposed. Keep S1's approved SELECT/DELETE allowlist,
-- client role/bypass preflight, table+column revokes and service_role rights.
-- This policy does not make historical client-mutable jobs trustworthy and
-- does not intercept FK cascades or service-role cleanup endpoints.
