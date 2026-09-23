-- Add questionnaire fields to author_applications
ALTER TABLE author_applications
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS has_published_before boolean,
  ADD COLUMN IF NOT EXISTS published_books_url text;
