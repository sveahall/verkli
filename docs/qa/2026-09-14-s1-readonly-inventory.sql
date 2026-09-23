-- S1: run this single SELECT in the production Supabase SQL editor.
-- Read-only metadata. No account rows, emails, object URLs or manuscript text.
-- One JSON result avoids losing earlier results in a multi-statement editor.
WITH target_roles AS (
  SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
), profile_columns AS (
  SELECT column_name, column_default, is_nullable, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
), chapter_media AS (
  SELECT o.metadata ->> 'mimetype' AS mime_type,
    split_part(o.name, '/', 1) AS book_key,
    split_part(o.name, '/', 2) AS chapter_key
  FROM storage.objects o WHERE o.bucket_id = 'chapter-media'
), classified_media AS (
  SELECT m.mime_type,
    b.id IS NOT NULL AS known_book,
    c.id IS NOT NULL AS known_chapter,
    CASE WHEN b.id IS NULL THEN 'unmatched'
      WHEN COALESCE(to_jsonb(b) ->> 'published', 'false') = 'true'
        OR COALESCE(to_jsonb(b) ->> 'is_published', 'false') = 'true'
        OR to_jsonb(b) ->> 'published_at' IS NOT NULL
        OR to_jsonb(b) ->> 'status' = 'published' THEN 'publication_marker_present'
      ELSE 'no_publication_marker' END AS publication_metadata,
    CASE WHEN b.id IS NULL THEN 'unmatched'
      WHEN (CASE
        WHEN COALESCE(to_jsonb(b) ->> 'price_amount', to_jsonb(b) ->> 'price_amount_minor', '0') ~ '^[0-9]+([.][0-9]+)?$'
        THEN COALESCE(to_jsonb(b) ->> 'price_amount', to_jsonb(b) ->> 'price_amount_minor', '0')::numeric
        ELSE 0 END) > 0
        THEN 'positive_book_price'
      ELSE 'no_positive_book_price_marker' END AS price_metadata
  FROM chapter_media m
  LEFT JOIN public.books b ON b.id::text = m.book_key
  LEFT JOIN public.chapters c ON c.id::text = m.chapter_key AND c.book_id = b.id
)
SELECT jsonb_build_object(
  'observed_at', now(),
  'server_version', current_setting('server_version'),
  'table_security', (SELECT jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'table', c.relname,
    'rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity
  )) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE (n.nspname = 'public' AND c.relname IN ('profiles', 'ai_jobs', 'audiobook_assets'))
       OR (n.nspname = 'storage' AND c.relname = 'objects')),
  'effective_profile_table_privileges', (SELECT jsonb_agg(jsonb_build_object(
    'role', rolname,
    'insert', has_table_privilege(rolname::text, 'public.profiles', 'INSERT'),
    'update', has_table_privilege(rolname::text, 'public.profiles', 'UPDATE'),
    'delete', has_table_privilege(rolname::text, 'public.profiles', 'DELETE')
  )) FROM target_roles),
  'effective_profile_column_privileges', (SELECT jsonb_agg(jsonb_build_object(
    'role', r.rolname, 'column', c.column_name, 'default', c.column_default,
    'insert', has_column_privilege(r.rolname::text, 'public.profiles', c.column_name, 'INSERT'),
    'update', has_column_privilege(r.rolname::text, 'public.profiles', c.column_name, 'UPDATE')
  ) ORDER BY r.rolname, c.column_name) FROM target_roles r CROSS JOIN profile_columns c),
  'profile_constraints', (SELECT jsonb_agg(jsonb_build_object(
    'name', conname, 'definition', pg_get_constraintdef(oid)
  )) FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass),
  'profile_triggers', (SELECT jsonb_agg(jsonb_build_object(
    'name', t.tgname, 'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid),
    'function', p.oid::regprocedure::text, 'security_definer', p.prosecdef
  )) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal),
  'policies', (SELECT jsonb_agg(jsonb_build_object(
    'schema', schemaname, 'table', tablename, 'name', policyname,
    'permissive', permissive, 'roles', roles, 'command', cmd,
    'using', qual, 'with_check', with_check
  ) ORDER BY schemaname, tablename, policyname) FROM pg_policies
    WHERE (schemaname = 'public' AND tablename IN ('profiles', 'ai_jobs', 'audiobook_assets'))
       OR (schemaname = 'storage' AND tablename = 'objects')),
  'buckets', (SELECT jsonb_agg(jsonb_build_object('id', id, 'public', public))
    FROM storage.buckets WHERE id IN ('chapter-media', 'audiobooks', 'tts-outputs', 'content-assets')),
  'chapter_media_counts', (SELECT jsonb_agg(to_jsonb(counts)) FROM (
    SELECT mime_type, known_book, known_chapter, publication_metadata, price_metadata, count(*) AS object_count
    FROM classified_media GROUP BY mime_type, known_book, known_chapter, publication_metadata, price_metadata
  ) counts),
  'classification_limit', 'Metadata markers only, not an entitlement decision. Chapter/version prices and actual content require separate review.'
) AS s1_inventory;
