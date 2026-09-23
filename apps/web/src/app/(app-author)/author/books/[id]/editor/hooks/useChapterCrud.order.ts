/**
 * Rewrite chapter order without colliding with UNIQUE(book_id, order).
 * Every row moves to its own negative sentinel first, then to the final slot.
 * A failed write returns false so the caller can put the previous order back.
 */
export async function rewriteChapterOrders(
  rows: Array<{ id: string; order: number }>,
  write: (id: string, order: number) => Promise<boolean>,
): Promise<boolean> {
  for (let i = 0; i < rows.length; i++) {
    if (!(await write(rows[i].id, -(i + 1)))) return false;
  }
  for (const row of rows) {
    if (!(await write(row.id, row.order))) return false;
  }
  return true;
}
