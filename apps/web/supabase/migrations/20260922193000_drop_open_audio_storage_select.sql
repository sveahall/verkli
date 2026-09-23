-- Any signed-in user could SELECT every object in these private buckets.
-- Legitimate playback goes through service-role signed URLs, which bypass RLS.
DROP POLICY IF EXISTS storage_audio_outputs_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS storage_content_assets_select_authenticated ON storage.objects;
