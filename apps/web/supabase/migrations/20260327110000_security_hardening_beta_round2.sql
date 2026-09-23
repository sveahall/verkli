-- Security hardening round 2 for beta
-- Fixes: C-5 (stripe_events), W-5 (profiles admin role), W-6 (ai_jobs INSERT),
--         W-8 (conversations UPDATE), W-11 (content-assets public bucket)

-- ============================================================================
-- C-5: stripe_events has zero RLS policies — intentional (service-role only).
--      Add explicit comment and a deny-all policy for defense-in-depth.
-- ============================================================================

COMMENT ON TABLE public.stripe_events IS
  'Stripe webhook idempotency log. Service-role only — no user-facing access.';

-- Deny all access for authenticated/anon roles (admin client bypasses RLS)
DROP POLICY IF EXISTS stripe_events_deny_all ON public.stripe_events;
CREATE POLICY stripe_events_deny_all ON public.stripe_events
  FOR ALL
  USING (false);


-- ============================================================================
-- W-5: profiles.role CHECK only allows 'author' and 'reader' — admin role
--      used in application code cannot be stored.
-- ============================================================================

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('author', 'reader', 'admin'));


-- ============================================================================
-- W-6: ai_jobs user-writable INSERT policy allows any authenticated user
--      to create arbitrary job records. All job creation must go through
--      API routes using the admin client.
-- ============================================================================

DROP POLICY IF EXISTS ai_jobs_insert_own ON public.ai_jobs;

COMMENT ON TABLE public.ai_jobs IS
  'AI job queue. INSERT via server-side API only (admin client). Users can SELECT/UPDATE own rows.';


-- ============================================================================
-- W-8: conversations UPDATE policy gives both participants unrestricted
--      column access — requester could flip status to 'accepted' directly.
--      Add a BEFORE UPDATE trigger to validate status transitions.
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_conversation_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Only allow status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- request -> accepted: only the non-requester can accept
  IF OLD.status = 'request' AND NEW.status = 'accepted' THEN
    IF auth.uid() = OLD.requester_id THEN
      RAISE EXCEPTION 'Only the recipient can accept a conversation request';
    END IF;
    NEW.accepted_at = now();
    RETURN NEW;
  END IF;

  -- any -> blocked: either participant can block
  IF NEW.status = 'blocked' THEN
    NEW.blocked_at = now();
    NEW.blocked_by = auth.uid();
    RETURN NEW;
  END IF;

  -- All other transitions are invalid
  RAISE EXCEPTION 'Invalid conversation status transition: % -> %', OLD.status, NEW.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS validate_conversation_status ON public.conversations;
CREATE TRIGGER validate_conversation_status
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION validate_conversation_status_transition();


-- ============================================================================
-- W-11: content-assets storage bucket is public — private AI-generated
--       content accessible without authentication.
-- ============================================================================

UPDATE storage.buckets
SET public = false
WHERE id = 'content-assets';

-- Replace the public SELECT policy with authenticated-only
DROP POLICY IF EXISTS storage_content_assets_select_public ON storage.objects;
CREATE POLICY storage_content_assets_select_authenticated ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'content-assets'
    AND auth.role() = 'authenticated'
  );
