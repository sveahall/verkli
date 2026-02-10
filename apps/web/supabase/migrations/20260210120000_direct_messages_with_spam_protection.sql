-- Direct messages with request inbox, block list, and sender rate limit
-- Rules:
-- - Author -> author: accepted immediately
-- - Reader -> author: starts as request
-- - Author can accept or block
-- - Block list + sender rate limit reduce spam

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_one_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_two_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'request' CHECK (status IN ('request', 'accepted', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  accepted_at timestamptz,
  blocked_at timestamptz,
  blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT conversations_distinct_participants CHECK (participant_one_id <> participant_two_id),
  CONSTRAINT conversations_ordered_participants CHECK (participant_one_id < participant_two_id),
  CONSTRAINT conversations_requester_participant CHECK (
    requester_id = participant_one_id OR requester_id = participant_two_id
  ),
  CONSTRAINT conversations_creator_is_requester CHECK (created_by = requester_id),
  CONSTRAINT conversations_blocked_by_participant CHECK (
    blocked_by IS NULL
    OR blocked_by = participant_one_id
    OR blocked_by = participant_two_id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_pair_unique_idx
  ON public.conversations(participant_one_id, participant_two_id);

CREATE INDEX IF NOT EXISTS conversations_status_last_message_idx
  ON public.conversations(status, last_message_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS conversations_requester_status_idx
  ON public.conversations(requester_id, status);

DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.conversations IS 'Direct-message threads between two users. Status controls request/accepted/blocked workflow.';
COMMENT ON COLUMN public.conversations.status IS 'request=awaiting author approval, accepted=two-way chat, blocked=blocked by one participant.';

-- ---------------------------------------------------------------------------
-- Conversation participants (explicit join table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON public.conversation_participants(user_id, conversation_id);

CREATE OR REPLACE FUNCTION public.sync_conversation_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES
    (NEW.id, NEW.participant_one_id),
    (NEW.id, NEW.participant_two_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_sync_participants ON public.conversations;
CREATE TRIGGER conversations_sync_participants
  AFTER INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_conversation_participants();

-- Backfill in case table/function already existed before this migration was applied.
INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT c.id, c.participant_one_id
FROM public.conversations c
ON CONFLICT (conversation_id, user_id) DO NOTHING;

INSERT INTO public.conversation_participants (conversation_id, user_id)
SELECT c.id, c.participant_two_id
FROM public.conversations c
ON CONFLICT (conversation_id, user_id) DO NOTHING;

COMMENT ON TABLE public.conversation_participants IS 'Join table for conversation memberships.';

-- ---------------------------------------------------------------------------
-- Block list
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_user_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT message_user_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS message_user_blocks_blocked_idx
  ON public.message_user_blocks(blocked_id, blocker_id);

COMMENT ON TABLE public.message_user_blocks IS 'User-level DM block list. If a pair is blocked in either direction, messaging is blocked.';

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON public.messages(sender_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conversation_row public.conversations%ROWTYPE;
BEGIN
  IF NEW.created_at IS NULL THEN
    NEW.created_at := now();
  END IF;

  SELECT *
  INTO conversation_row
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF conversation_row.id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF NEW.sender_id <> conversation_row.participant_one_id
    AND NEW.sender_id <> conversation_row.participant_two_id THEN
    RAISE EXCEPTION 'Sender is not a conversation participant';
  END IF;

  IF conversation_row.status = 'blocked' THEN
    RAISE EXCEPTION 'Conversation is blocked';
  END IF;

  IF conversation_row.status = 'request' AND conversation_row.requester_id <> NEW.sender_id THEN
    RAISE EXCEPTION 'Only requester can send while conversation is pending';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.message_user_blocks b
    WHERE
      (b.blocker_id = conversation_row.participant_one_id AND b.blocked_id = conversation_row.participant_two_id)
      OR (b.blocker_id = conversation_row.participant_two_id AND b.blocked_id = conversation_row.participant_one_id)
  ) THEN
    RAISE EXCEPTION 'Conversation blocked by user list';
  END IF;

  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_conversation_on_message_insert();

COMMENT ON TABLE public.messages IS 'Direct messages within a conversation.';

-- ---------------------------------------------------------------------------
-- Sender rate limit state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dm_sender_rate_limits (
  sender_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.dm_consume_rate_limit(
  p_sender_id uuid,
  p_max integer DEFAULT 12,
  p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := now();
  window_ts timestamptz;
  current_count integer;
BEGIN
  IF p_sender_id IS NULL OR p_max < 1 OR p_window_seconds < 1 THEN
    RETURN false;
  END IF;

  INSERT INTO public.dm_sender_rate_limits (
    sender_id,
    window_started_at,
    sent_count,
    updated_at
  )
  VALUES (
    p_sender_id,
    now_ts,
    1,
    now_ts
  )
  ON CONFLICT (sender_id)
  DO UPDATE SET
    sent_count = CASE
      WHEN dm_sender_rate_limits.window_started_at <= now_ts - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE dm_sender_rate_limits.sent_count + 1
    END,
    window_started_at = CASE
      WHEN dm_sender_rate_limits.window_started_at <= now_ts - make_interval(secs => p_window_seconds)
        THEN now_ts
      ELSE dm_sender_rate_limits.window_started_at
    END,
    updated_at = now_ts
  RETURNING window_started_at, sent_count
  INTO window_ts, current_count;

  IF window_ts > now_ts - make_interval(secs => p_window_seconds)
    AND current_count > p_max THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dm_consume_rate_limit(uuid, integer, integer) TO authenticated;

COMMENT ON TABLE public.dm_sender_rate_limits IS 'Mutable sender counters used by dm_consume_rate_limit().' ;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_sender_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_select_participant ON public.conversations;
CREATE POLICY conversations_select_participant ON public.conversations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = participant_one_id OR auth.uid() = participant_two_id);

DROP POLICY IF EXISTS conversations_insert_participant ON public.conversations;
CREATE POLICY conversations_insert_participant ON public.conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND created_by = requester_id
    AND (auth.uid() = participant_one_id OR auth.uid() = participant_two_id)
    AND participant_one_id <> participant_two_id
  );

DROP POLICY IF EXISTS conversations_update_participant ON public.conversations;
CREATE POLICY conversations_update_participant ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = participant_one_id OR auth.uid() = participant_two_id)
  WITH CHECK (auth.uid() = participant_one_id OR auth.uid() = participant_two_id);

DROP POLICY IF EXISTS conversation_participants_select_member ON public.conversation_participants;
CREATE POLICY conversation_participants_select_member ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_participants.conversation_id
        AND (c.participant_one_id = auth.uid() OR c.participant_two_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS messages_select_participant ON public.messages;
CREATE POLICY messages_select_participant ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (auth.uid() = c.participant_one_id OR auth.uid() = c.participant_two_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.message_user_blocks b
          WHERE
            (b.blocker_id = c.participant_one_id AND b.blocked_id = c.participant_two_id)
            OR (b.blocker_id = c.participant_two_id AND b.blocked_id = c.participant_one_id)
        )
    )
  );

DROP POLICY IF EXISTS messages_insert_sender ON public.messages;
CREATE POLICY messages_insert_sender ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (auth.uid() = c.participant_one_id OR auth.uid() = c.participant_two_id)
        AND c.status <> 'blocked'
        AND (c.status = 'accepted' OR c.requester_id = auth.uid())
        AND NOT EXISTS (
          SELECT 1
          FROM public.message_user_blocks b
          WHERE
            (b.blocker_id = c.participant_one_id AND b.blocked_id = c.participant_two_id)
            OR (b.blocker_id = c.participant_two_id AND b.blocked_id = c.participant_one_id)
        )
    )
  );

DROP POLICY IF EXISTS message_user_blocks_select_own ON public.message_user_blocks;
CREATE POLICY message_user_blocks_select_own ON public.message_user_blocks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS message_user_blocks_insert_own ON public.message_user_blocks;
CREATE POLICY message_user_blocks_insert_own ON public.message_user_blocks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id AND blocker_id <> blocked_id);

DROP POLICY IF EXISTS message_user_blocks_delete_own ON public.message_user_blocks;
CREATE POLICY message_user_blocks_delete_own ON public.message_user_blocks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

COMMENT ON POLICY conversations_select_participant ON public.conversations IS 'Only participants can see their conversations.';
COMMENT ON POLICY messages_insert_sender ON public.messages IS 'Only participants can send, pending requests are requester-only, and blocked pairs cannot send.';
