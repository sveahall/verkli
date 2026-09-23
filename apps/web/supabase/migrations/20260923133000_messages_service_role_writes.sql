-- Clients could insert a conversation with status = 'accepted', skipping the
-- reader-to-author request rule, and update either participant id. The new
-- participant then matches messages_select_participant, so the history moves
-- with the row. Accept, block, and send already use the service role.
-- Participants keep their SELECT.

DROP POLICY IF EXISTS conversations_insert_participant ON public.conversations;
DROP POLICY IF EXISTS conversations_update_participant ON public.conversations;
DROP POLICY IF EXISTS messages_insert_sender ON public.messages;
