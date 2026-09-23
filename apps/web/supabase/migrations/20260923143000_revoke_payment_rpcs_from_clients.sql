-- These SECURITY DEFINER functions were reachable with the public anon key.
-- finalize_* marks a local order paid and writes an entitlement when the
-- Stripe session id matches a row. It does not ask Stripe whether the
-- payment succeeded. grant_user_credits_once inserts credits.
-- upsert/update_author_subscription writes an active subscription.
-- revoke_order_for_refund undoes a purchase.
--
-- The webhook calls them with the service role. Nobody else should.

REVOKE ALL ON FUNCTION public.finalize_order_checkout_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_order_checkout_session(text) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_donation_checkout_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_donation_checkout_session(text) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_credit_topup_checkout_session(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_credit_topup_checkout_session(text) TO service_role;

REVOKE ALL ON FUNCTION public.grant_user_credits_once(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_user_credits_once(uuid, integer, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.revoke_order_for_refund(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_order_for_refund(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_author_subscription(uuid, uuid, text, text, integer, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_author_subscription(uuid, uuid, text, text, integer, text, text, timestamptz, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.update_author_subscription_status(text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_author_subscription_status(text, text, timestamptz, timestamptz) TO service_role;
