-- Security hardening for beta release
-- Fixes: C-1 (books INSERT), C-2 (tts-outputs public), C-4 (author self-approve),
--         W-2 (users anon SELECT), W-12 (profiles default role)

-- ============================================================================
-- C-1: books table missing INSERT policy — any authenticated user could
--      create books with arbitrary author_id
-- ============================================================================

DROP POLICY IF EXISTS "Authors can insert own books" ON public.books;
CREATE POLICY "Authors can insert own books"
  ON public.books FOR INSERT
  WITH CHECK (auth.uid() = author_id);


-- ============================================================================
-- C-2: tts-outputs storage bucket still public — audio accessible without auth
-- ============================================================================

UPDATE storage.buckets
SET public = false
WHERE id = 'tts-outputs';

-- Replace the overly permissive public SELECT policy with authenticated-only
DROP POLICY IF EXISTS storage_audio_outputs_select_public ON storage.objects;
CREATE POLICY storage_audio_outputs_select_authenticated ON storage.objects
  FOR SELECT
  USING (
    bucket_id IN ('audiobooks', 'tts-outputs')
    AND auth.role() = 'authenticated'
  );


-- ============================================================================
-- C-4: author_applications INSERT policy allows users to self-approve
--      (status column is unconstrained — user can insert status='approved')
--      Fix: restrict INSERT to status='pending' only
-- ============================================================================

DROP POLICY IF EXISTS author_applications_insert_own ON public.author_applications;
CREATE POLICY author_applications_insert_own ON public.author_applications
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );


-- ============================================================================
-- W-2: public.users SELECT policy exposes emails to anon role
-- ============================================================================

DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users;
CREATE POLICY "Users are viewable by authenticated"
  ON public.users FOR SELECT
  USING (auth.role() = 'authenticated');


-- ============================================================================
-- W-12: profiles.role defaults to 'author' — bypasses application flow
-- ============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'reader';
