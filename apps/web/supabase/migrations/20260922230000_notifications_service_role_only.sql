-- notifications_insert_authenticated allowed a signed-in user to insert a
-- row whenever they set actor_id to themselves. user_id, the recipient, was
-- unconstrained, and title/body are free text. Follow and comment replies
-- now insert through the service role, which bypasses RLS. Clients no longer
-- have an insert policy.

DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
