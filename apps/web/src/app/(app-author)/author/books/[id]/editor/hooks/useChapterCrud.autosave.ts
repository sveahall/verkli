/**
 * Drain semantics for chapter autosave.
 *
 * Extracted from the hook because the ordering rules are where an author's
 * prose was being lost, and they are worth testing directly rather than
 * through a React harness.
 *
 * The bug this replaces: the queue was a `Map` keyed by chapter id, but the
 * drain loop only ever re-read the key for the chapter it happened to be
 * saving. `savingRef` was a single global flag, so a payload recorded for
 * chapter B while chapter A was mid-save survived A's drain untouched — and was
 * then replayed AFTER B's next, newer save, writing older prose over newer.
 * One author, one device, no concurrency required.
 *
 * The rules that fix it:
 *
 *   - The queue is the single source of truth for "what still needs writing".
 *     Callers always enqueue; only one drain runs at a time.
 *   - Keying by chapter id gives newest-wins for free: a later payload for the
 *     same chapter replaces an earlier one instead of queueing behind it.
 *   - The drain empties the WHOLE queue, not just one chapter's key, so a
 *     chapter the author switched away from still gets written.
 *   - An entry is removed before its write, so a payload arriving mid-write
 *     re-adds the key and the loop comes back for it. Nothing is replayed on
 *     top of something newer.
 */

export interface PersistResult {
  ok: boolean;
  /** The exact string written, for optimistic local state. */
  serialized: string;
}

export type PersistChapter = (
  chapterId: string,
  payload: Record<string, unknown>
) => Promise<PersistResult>;

export interface DrainResult {
  /** chapterId -> serialized content actually persisted. */
  saved: Map<string, string>;
  /** Set when a write failed and the drain stopped early. */
  failedChapterId: string | null;
}

/**
 * Write every queued chapter payload, newest-wins, stopping at the first
 * failure. Mutates `pending` as it goes — that map IS the queue, and leaving
 * unwritten work in it is deliberate so a later drain can pick it up.
 */
export async function drainPendingSaves(
  pending: Map<string, Record<string, unknown>>,
  persist: PersistChapter
): Promise<DrainResult> {
  const saved = new Map<string, string>();

  while (pending.size > 0) {
    const next = pending.entries().next();
    if (next.done === true) break;
    const [chapterId, payload] = next.value;

    // Remove before writing. If a newer payload for this chapter arrives while
    // the await is in flight, it re-adds the key and the loop returns for it —
    // which is what stops an older snapshot landing after a newer one.
    pending.delete(chapterId);

    const result = await persist(chapterId, payload);

    if (!result.ok) {
      // Do not drop the content on the floor. Put it back so a later drain can
      // retry — unless a newer payload for this chapter arrived while we were
      // writing, in which case the newer one is already queued and must win.
      if (!pending.has(chapterId)) pending.set(chapterId, payload);
      return { saved, failedChapterId: chapterId };
    }

    saved.set(chapterId, result.serialized);
  }

  return { saved, failedChapterId: null };
}
