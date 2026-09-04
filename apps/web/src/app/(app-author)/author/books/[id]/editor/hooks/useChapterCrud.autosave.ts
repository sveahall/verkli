/**
 * Drain semantics for chapter autosave.
 *
 * Extracted from the hook because the ordering rules are where an author's
 * prose was being lost, and they are worth testing directly rather than
 * through a React harness.
 *
 * The original bug: the queue was a `Map` keyed by chapter id, but the drain
 * loop only ever re-read the key for the chapter it happened to be saving.
 * `savingRef` was a single global flag, so a payload recorded for chapter B
 * while chapter A was mid-save survived A's drain untouched — and was then
 * replayed AFTER B's next, newer save, writing older prose over newer. One
 * author, one device, no concurrency required.
 *
 * The rules:
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
 *   - One chapter's failure never blocks another's. A `Map` iterates in
 *     insertion order, so an entry that can never succeed sits at the head of
 *     the queue; stopping the drain there stranded every valid chapter behind
 *     it indefinitely. Failures are skipped for the rest of the pass and
 *     reported, and the drain keeps going.
 *   - A write that matched no row is not retried. Re-queueing a chapter that no
 *     longer exists cannot ever succeed, and it was exactly what wedged the
 *     head of the queue.
 */

/**
 * `missing` means the write matched no row: deleted underneath by an
 * `overwrite_draft` import, or refused by RLS. Retrying cannot help.
 * `transient` means the write errored and is worth keeping for another attempt.
 */
export type PersistOutcome = "written" | "transient" | "missing";

export interface PersistResult {
  outcome: PersistOutcome;
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
  /** Errored and still queued, worth another attempt. */
  transientFailures: string[];
  /** Matched no row. Dropped from the queue, because retrying cannot help. */
  missingChapters: string[];
}

/** First queued entry not yet attempted in this pass, or null when none remain. */
function nextUnattempted(
  pending: Map<string, Record<string, unknown>>,
  attempted: ReadonlySet<string>
): [string, Record<string, unknown>] | null {
  for (const entry of pending) {
    if (!attempted.has(entry[0])) return entry;
  }
  return null;
}

/**
 * Write every queued chapter payload, newest-wins, skipping chapters that have
 * already failed in this pass. Mutates `pending` as it goes — that map IS the
 * queue, and leaving retryable work in it is deliberate so a later drain can
 * pick it up.
 */
export async function drainPendingSaves(
  pending: Map<string, Record<string, unknown>>,
  persist: PersistChapter
): Promise<DrainResult> {
  const saved = new Map<string, string>();
  const transientFailures: string[] = [];
  const missingChapters: string[] = [];
  // Chapters that failed in this pass. Skipped for the remainder of it so a
  // re-queued failure cannot spin the loop or shadow the chapters behind it.
  // A chapter that SUCCEEDS is deliberately not in here, so fresh content
  // arriving mid-drain is still written before the pass ends.
  const failedThisPass = new Set<string>();

  for (;;) {
    const entry = nextUnattempted(pending, failedThisPass);
    if (entry === null) break;
    const [chapterId, payload] = entry;

    // Remove before writing. If a newer payload for this chapter arrives while
    // the await is in flight, it re-adds the key and the loop returns for it —
    // which is what stops an older snapshot landing after a newer one.
    pending.delete(chapterId);

    const result = await persist(chapterId, payload);

    if (result.outcome === "written") {
      saved.set(chapterId, result.serialized);
      continue;
    }

    failedThisPass.add(chapterId);

    if (result.outcome === "transient") {
      // Do not drop the content on the floor — unless a newer payload arrived
      // while we were writing, in which case the newer one must win.
      if (!pending.has(chapterId)) pending.set(chapterId, payload);
      transientFailures.push(chapterId);
      continue;
    }

    // missing: the row is gone. Keeping it queued would retry forever and, on a
    // Map's insertion order, block every valid chapter behind it.
    missingChapters.push(chapterId);
  }

  return { saved, transientFailures, missingChapters };
}
