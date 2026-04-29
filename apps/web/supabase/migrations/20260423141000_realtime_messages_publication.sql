-- Enable Supabase Realtime for direct-message tables so the inbox can
-- subscribe to postgres_changes instead of relying on 5s polling.
--
-- `supabase_realtime` publication is created by Supabase at project init.
-- Tables must be added explicitly; this migration is idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
  END IF;
END
$$;

-- Ensure replica identity is sufficient for UPDATE/DELETE events to include
-- primary key (default on tables with a PK, but set explicitly to be safe).
ALTER TABLE public.messages REPLICA IDENTITY DEFAULT;
ALTER TABLE public.conversations REPLICA IDENTITY DEFAULT;
