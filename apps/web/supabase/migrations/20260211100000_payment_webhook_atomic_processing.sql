-- Atomic Stripe checkout finalization helpers for webhook processing.
-- These functions lock the target row, apply status transitions exactly once,
-- and keep entitlement / credit side effects idempotent.

CREATE OR REPLACE FUNCTION public.finalize_order_checkout_session(
  p_stripe_session_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_stripe_session_id IS NULL OR btrim(p_stripe_session_id) = '' THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE stripe_session_id = p_stripe_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_order.status IS DISTINCT FROM 'paid' THEN
    UPDATE public.orders
    SET status = 'paid'
    WHERE id = v_order.id
      AND status IN ('pending', 'failed');
  END IF;

  INSERT INTO public.entitlements (user_id, book_id, source)
  VALUES (v_order.user_id, v_order.book_id, 'purchase')
  ON CONFLICT (user_id, book_id) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_order_checkout_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_order_checkout_session(text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_donation_checkout_session(
  p_stripe_session_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_donation public.donations%ROWTYPE;
  v_granted boolean := false;
BEGIN
  IF p_stripe_session_id IS NULL OR btrim(p_stripe_session_id) = '' THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_donation
  FROM public.donations
  WHERE stripe_session_id = p_stripe_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_donation.status IS DISTINCT FROM 'paid' OR v_donation.paid_at IS NULL THEN
    UPDATE public.donations
    SET status = 'paid',
        paid_at = COALESCE(paid_at, now())
    WHERE id = v_donation.id;
  END IF;

  IF COALESCE(v_donation.credits_delta, 0) > 0 AND v_donation.credits_applied_at IS NULL THEN
    v_granted := public.grant_user_credits_once(
      v_donation.user_id,
      v_donation.credits_delta,
      'donation',
      v_donation.id
    );

    IF v_granted OR EXISTS (
      SELECT 1
      FROM public.credit_grants
      WHERE source = 'donation'
        AND source_id = v_donation.id
    ) THEN
      UPDATE public.donations
      SET credits_applied_at = COALESCE(credits_applied_at, now())
      WHERE id = v_donation.id;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_donation_checkout_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_donation_checkout_session(text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_credit_topup_checkout_session(
  p_stripe_session_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_topup public.credit_topups%ROWTYPE;
  v_granted boolean := false;
BEGIN
  IF p_stripe_session_id IS NULL OR btrim(p_stripe_session_id) = '' THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_topup
  FROM public.credit_topups
  WHERE stripe_session_id = p_stripe_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_topup.status IS DISTINCT FROM 'paid' OR v_topup.paid_at IS NULL THEN
    UPDATE public.credit_topups
    SET status = 'paid',
        paid_at = COALESCE(paid_at, now())
    WHERE id = v_topup.id;
  END IF;

  IF COALESCE(v_topup.credits_delta, 0) > 0 AND v_topup.credits_applied_at IS NULL THEN
    v_granted := public.grant_user_credits_once(
      v_topup.user_id,
      v_topup.credits_delta,
      'credit_topup',
      v_topup.id
    );

    IF v_granted OR EXISTS (
      SELECT 1
      FROM public.credit_grants
      WHERE source = 'credit_topup'
        AND source_id = v_topup.id
    ) THEN
      UPDATE public.credit_topups
      SET credits_applied_at = COALESCE(credits_applied_at, now())
      WHERE id = v_topup.id;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_credit_topup_checkout_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_credit_topup_checkout_session(text) TO service_role;
