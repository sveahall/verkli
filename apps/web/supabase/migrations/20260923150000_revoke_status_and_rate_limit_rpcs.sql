-- refresh_book_audiobook_status is SECURITY DEFINER with row_security off.
-- The public anon key can pass any book id and flip audiobook_status.
-- The asset trigger calls it as the function owner, so clients do not need EXECUTE.
--
-- dm_consume_rate_limit does not check that the caller is p_sender_id.
-- The anon key can burn another user's send window. The send route already
-- calls it with the service role.

REVOKE ALL ON FUNCTION public.refresh_book_audiobook_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_book_audiobook_status(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.dm_consume_rate_limit(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dm_consume_rate_limit(uuid, integer, integer) TO service_role;
