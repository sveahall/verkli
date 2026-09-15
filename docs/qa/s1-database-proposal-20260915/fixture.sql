-- LOCAL SYNTHETIC FIXTURE ONLY. Never run against an existing database.
-- Policy/function definitions captured read-only on 2026-09-15; tables are minimal fixtures.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY, raw_user_meta_data jsonb DEFAULT '{}');
CREATE TYPE public.book_status AS ENUM ('DRAFT','PUBLISHED');
CREATE TABLE public.profiles (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role text DEFAULT 'reader' CHECK (role IN ('author','reader','admin')),
 demo_mode boolean DEFAULT false, is_protected boolean DEFAULT false,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), search_vector tsvector,
 age_verified_at timestamptz, avatar_url text, bio text, cover_image text, deletion_requested_at timestamptz,
 display_name text, is_public boolean DEFAULT true, onboarding_completed_at timestamptz,
 preferences jsonb DEFAULT '{}', social_links jsonb DEFAULT '{}', username text UNIQUE, website_url text
);
CREATE TABLE public.books (id uuid PRIMARY KEY, author_id uuid, status public.book_status DEFAULT 'DRAFT');
CREATE TABLE public.chapters (id uuid PRIMARY KEY, book_id uuid);
CREATE TABLE public.ai_jobs (id uuid PRIMARY KEY, user_id uuid, book_id uuid, status text, output jsonb);
CREATE TABLE public.audiobook_assets (id uuid PRIMARY KEY, book_id uuid, audio_path text, language text, UNIQUE(book_id,language));
CREATE TABLE public.chapter_audio_cache (id uuid PRIMARY KEY, chapter_id uuid, audio_path text);
CREATE TABLE storage.objects (id uuid PRIMARY KEY, bucket_id text, name text, owner uuid);
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public,storage TO anon,authenticated,service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audiobook_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapter_audio_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_jobs_delete_own" ON public.ai_jobs AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "ai_jobs_select_own" ON public.ai_jobs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "ai_jobs_update_own" ON public.ai_jobs AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "audiobook_assets_delete" ON public.audiobook_assets AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM books b
  WHERE ((b.id = audiobook_assets.book_id) AND (b.author_id = auth.uid())))));
CREATE POLICY "audiobook_assets_insert" ON public.audiobook_assets AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM books b
  WHERE ((b.id = audiobook_assets.book_id) AND (b.author_id = auth.uid())))));
CREATE POLICY "audiobook_assets_select" ON public.audiobook_assets AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM books b
  WHERE ((b.id = audiobook_assets.book_id) AND ((b.status = 'PUBLISHED'::book_status) OR (b.author_id = auth.uid()))))));
CREATE POLICY "audiobook_assets_update" ON public.audiobook_assets AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM books b
  WHERE ((b.id = audiobook_assets.book_id) AND (b.author_id = auth.uid())))));
CREATE POLICY "Users can delete own profile" ON public.profiles AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "profiles public read public writers" ON public.profiles AS PERMISSIVE FOR SELECT TO anon,authenticated USING (((is_public = true) AND (role = 'writer'::text)));
CREATE POLICY "Authenticated insert avatars" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'avatars'::text));
CREATE POLICY "Authenticated insert chapter media" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'chapter-media'::text));
CREATE POLICY "Owner delete storage" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((auth.uid() = owner) AND (bucket_id = ANY (ARRAY['avatars'::text, 'chapter-media'::text, 'book-covers'::text]))));
CREATE POLICY "Owner update storage" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid() = owner) AND (bucket_id = ANY (ARRAY['avatars'::text, 'chapter-media'::text, 'book-covers'::text]))));
CREATE POLICY "Public read avatars" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'avatars'::text));
CREATE POLICY "Public read chapter media" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'chapter-media'::text));
CREATE POLICY "book_covers_delete_own 1uu3agi_0" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'book_covers'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));
CREATE POLICY "book_covers_delete_own 1uu3agi_1" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'book_covers'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));
CREATE POLICY "book_covers_insert_own 1uu3agi_0" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'book_covers'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));
CREATE POLICY "book_covers_select_public 1uu3agi_0" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'book_covers'::text));
CREATE POLICY "book_covers_update_own 1uu3agi_0" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'book_covers'::text) AND (split_part(name, '/'::text, 1) = (auth.uid())::text)));
CREATE POLICY "storage_audio_outputs_select_authenticated" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = ANY (ARRAY['audiobooks'::text, 'tts-outputs'::text])) AND (auth.role() = 'authenticated'::text)));
CREATE POLICY "storage_book_covers_delete_owner" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'book_covers'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_book_covers_insert_owner" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'book_covers'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_book_covers_select_public" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'book_covers'::text));
CREATE POLICY "storage_book_covers_update_owner" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'book_covers'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'book_covers'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_content_assets_delete_owner" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'content-assets'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_content_assets_insert_owner" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'content-assets'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_content_assets_select_authenticated" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'content-assets'::text) AND (auth.role() = 'authenticated'::text)));
CREATE POLICY "storage_content_assets_update_owner" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'content-assets'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'content-assets'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "storage_marketing_media_delete_owner" ON storage.objects AS PERMISSIVE FOR DELETE TO public USING (((bucket_id = 'marketing-media'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = 'trailers'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
CREATE POLICY "storage_marketing_media_insert_owner" ON storage.objects AS PERMISSIVE FOR INSERT TO public WITH CHECK (((bucket_id = 'marketing-media'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = 'trailers'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
CREATE POLICY "storage_marketing_media_select" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'marketing-media'::text));
CREATE POLICY "storage_marketing_media_update_owner" ON storage.objects AS PERMISSIVE FOR UPDATE TO public USING (((bucket_id = 'marketing-media'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = 'trailers'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text))) WITH CHECK (((bucket_id = 'marketing-media'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = 'trailers'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
CREATE POLICY "storage_tts_previews_select_owner" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'tts_previews'::text) AND (auth.role() = 'authenticated'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY chapter_audio_cache_select ON public.chapter_audio_cache FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (chapters c
     JOIN books b ON ((b.id = c.book_id)))
  WHERE ((c.id = chapter_audio_cache.chapter_id) AND (b.author_id = auth.uid())))));
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
GRANT EXECUTE ON FUNCTION public.handle_new_profile() TO anon,authenticated,service_role;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO auth.users(id,raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-000000000001','{"role":"author"}'),
 ('00000000-0000-0000-0000-000000000002','{"role":"reader"}'),
 ('00000000-0000-0000-0000-000000000003','{}');
DELETE FROM public.profiles WHERE user_id='00000000-0000-0000-0000-000000000003';
INSERT INTO public.books VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','DRAFT'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','DRAFT');
INSERT INTO public.chapters VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
INSERT INTO public.ai_jobs VALUES ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','running','{}'),('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','running','{}');
INSERT INTO public.audiobook_assets VALUES ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','legitimate.mp3','en');
INSERT INTO public.chapter_audio_cache VALUES ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','cache.mp3');
INSERT INTO storage.objects SELECT ('60000000-0000-0000-0000-00000000000'||n)::uuid,bucket,'foreign/private.mp3','00000000-0000-0000-0000-000000000002'::uuid FROM unnest(ARRAY['audiobooks','tts-outputs','content-assets','book_covers']) WITH ORDINALITY t(bucket,n);
