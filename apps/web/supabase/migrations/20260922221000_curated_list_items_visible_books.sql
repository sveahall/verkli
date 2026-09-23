-- curated_list_items was USING (true). The list page filters books afterwards,
-- but the item row itself still exposed the book id, including drafts and
-- inactive lists. Show an item only when the list is active and the book is
-- visible to this caller. Writes stay on the service role.

DROP POLICY IF EXISTS curated_list_items_select ON public.curated_list_items;
CREATE POLICY curated_list_items_select ON public.curated_list_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.curated_lists l
      WHERE l.id = curated_list_items.list_id
        AND l.is_active = true
    )
    AND public.can_view_book(curated_list_items.book_id, auth.uid())
  );
