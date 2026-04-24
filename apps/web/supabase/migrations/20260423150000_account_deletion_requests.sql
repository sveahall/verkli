-- ---------------------------------------------------------------------------
-- Soft-request queue for account deletion (GDPR Art. 17 right-to-erasure).
--
-- Real account deletion cascades across billing rows, audit logs, external
-- Stripe customers, Resend audience entries, etc. — it must not happen
-- inside a single request handler. This column records the user's intent;
-- a scheduled admin job (or a manual admin action) does the actual teardown
-- and then deletes the auth.users row.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_deletion_requested_idx
  ON public.profiles (deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;
