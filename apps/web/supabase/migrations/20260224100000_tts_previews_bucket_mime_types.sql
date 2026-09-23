-- Expand tts_previews bucket to accept all audio/video MIME types used by
-- browser MediaRecorder and common file uploads (m4a, webm, ogg, mp4, mov).
-- Also raise file_size_limit to match the API guard (80 MB).

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'audio/wav',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/webm',
    'audio/ogg',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-matroska'
  ]::text[],
  file_size_limit = 83886080   -- 80 * 1024 * 1024
WHERE id = 'tts_previews';
