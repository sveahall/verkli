-- ---------------------------------------------------------------------------
-- Allow 'trailer' as a stripe_session_redemptions.kind.
--
-- The one-off trailer SKU reuses the session-redemption pattern
-- (claimStripeSessionRedemption(kind: 'trailer')). The original CHECK
-- constraint in 20260423130000_stripe_session_redemptions.sql only permitted
-- 'translation' and 'audiobook', so a paid trailer session could never be
-- redeemed (INSERT would fail the CHECK). This widens the allowed set.
--
-- Idempotent: drop-if-exists then re-add the named constraint.
--
-- rollback:
--   ALTER TABLE public.stripe_session_redemptions
--     DROP CONSTRAINT IF EXISTS stripe_session_redemptions_kind_check;
--   ALTER TABLE public.stripe_session_redemptions
--     ADD CONSTRAINT stripe_session_redemptions_kind_check
--     CHECK (kind IN ('translation', 'audiobook'));
-- ---------------------------------------------------------------------------

ALTER TABLE public.stripe_session_redemptions
  DROP CONSTRAINT IF EXISTS stripe_session_redemptions_kind_check;

ALTER TABLE public.stripe_session_redemptions
  ADD CONSTRAINT stripe_session_redemptions_kind_check
  CHECK (kind IN ('translation', 'audiobook', 'trailer'));
