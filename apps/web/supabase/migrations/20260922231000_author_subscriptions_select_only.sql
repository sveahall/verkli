-- "Subscriber owns their subscriptions" is FOR ALL. WITH CHECK falls back to
-- USING, so a signed-in reader can insert a row with status = 'active' for
-- any author. canUserReadBook treats that row as a purchase, and the
-- audiobook play route then signs the audio with the service role.
--
-- Checkout and the Stripe webhook already write this table with the service
-- role. Readers keep a SELECT of their own rows. Authors keep their SELECT.

DROP POLICY IF EXISTS "Subscriber owns their subscriptions" ON public.author_subscriptions;
CREATE POLICY author_subscriptions_select_own ON public.author_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = subscriber_user_id);
