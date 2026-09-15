-- EMERGENCY RECOVERY PROPOSAL ONLY. This restores known unsafe permissions.
-- NOT an automatic deploy rollback. Prefer ROLLBACK before committing hardening.
-- After commit: fresh explicit incident approval and access containment required.
-- Based on read-only 2026-09-15 snapshot: no client column ACL/inherited roles.
DO $restore$
DECLARE t text; columns_sql text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','ai_jobs','audiobook_assets','chapter_audio_cache'] LOOP
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns_sql
    FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.%I FROM anon,authenticated',columns_sql,t);
    EXECUTE format('GRANT ALL PRIVILEGES ON public.%I TO anon,authenticated',t);
  END LOOP;
END;
$restore$;
DROP POLICY IF EXISTS "ai_jobs_update_own" ON public.ai_jobs;
CREATE POLICY "ai_jobs_update_own" ON public.ai_jobs AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
DROP POLICY IF EXISTS "audiobook_assets_insert" ON public.audiobook_assets;
CREATE POLICY "audiobook_assets_insert" ON public.audiobook_assets AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM books b
  WHERE ((b.id = audiobook_assets.book_id) AND (b.author_id = auth.uid())))));
DROP POLICY IF EXISTS "audiobook_assets_update" ON public.audiobook_assets;
CREATE POLICY "audiobook_assets_update" ON public.audiobook_assets AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM books b
  WHERE ((b.id = audiobook_assets.book_id) AND (b.author_id = auth.uid())))));
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile" ON public.profiles AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
DROP POLICY IF EXISTS "storage_audio_outputs_select_authenticated" ON storage.objects;
CREATE POLICY "storage_audio_outputs_select_authenticated" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = ANY (ARRAY['audiobooks'::text, 'tts-outputs'::text])) AND (auth.role() = 'authenticated'::text)));
DROP POLICY IF EXISTS "storage_content_assets_select_authenticated" ON storage.objects;
CREATE POLICY "storage_content_assets_select_authenticated" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'content-assets'::text) AND (auth.role() = 'authenticated'::text)));
CREATE OR REPLACE FUNCTION public.handle_new_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  role_text TEXT;
BEGIN
  role_text := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'reader'));
  IF role_text = 'writer' THEN
    role_text := 'author';
  END IF;
  IF role_text NOT IN ('author','reader') THEN
    role_text := 'reader';
  END IF;

  INSERT INTO public.profiles (user_id, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url',
    role_text
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$
;
NOTIFY pgrst, 'reload schema';
