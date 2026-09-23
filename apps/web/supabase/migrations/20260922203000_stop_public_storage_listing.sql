-- Public buckets stay downloadable by URL. These SELECT policies also let
-- anyone list every object, and the keys contain author ids and draft book ids.
-- Listing is the leak. Known public URLs keep working.
DROP POLICY IF EXISTS storage_book_covers_select_public ON storage.objects;
DROP POLICY IF EXISTS storage_marketing_media_select ON storage.objects;

DO $drop_open_lists$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'SELECT'
      AND qual NOT ILIKE '%auth.uid%'
      AND (
        qual ILIKE '%chapter-media%'
        OR qual ILIKE '%book_covers%'
        OR qual ILIKE '%marketing-media%'
        OR qual ILIKE '%avatars%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END;
$drop_open_lists$;
