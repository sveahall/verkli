/**
 * Debounce with a hard ceiling, for editor autosave.
 *
 * Two failure modes this exists to prevent, both of which lost an author's
 * prose silently:
 *
 * 1. A plain restart-on-every-keystroke debounce never fires while the author
 *    keeps typing. With a 500ms delay and no ceiling, someone writing steadily
 *    with gaps under 500ms produced NO save at all, for as long as the burst
 *    lasted. `maxWaitMs` bounds that: a burst can never run longer than the
 *    ceiling without committing.
 *
 * 2. Clearing the timer on unmount discards whatever was pending. `flush()`
 *    commits it instead, and is what the unmount path must call.
 *
 * The value is captured on `push`, not read at commit time, because the commit
 * can run from a React unmount cleanup — by which point the editor that would
 * have produced the value has already been destroyed by its own cleanup.
 */

export const AUTOSAVE_DEBOUNCE_MS = 500;

/**
 * Ceiling on how long sustained typing can go without a save. Keeps the
 * worst-case loss to a couple of seconds while leaving the write rate in the
 * same order as before: real typing has pauses, so the ceiling is a safety net
 * that rarely fires rather than a second timer running in parallel.
 */
export const AUTOSAVE_MAX_WAIT_MS = 2000;

/**
 * What the editor hands over per keystroke. Both fields are captured together
 * so the committed word count always describes the committed document.
 */
export interface EditorSnapshot {
  doc: Record<string, unknown>;
  text: string;
}

export interface AutosaveScheduler<T> {
  /**
   * Replace the commit target. A React caller sets this from an effect rather
   * than passing a closure at construction: the scheduler must outlive prop
   * changes to keep its pending value and its timer, but the commit has to see
   * the current props. Doing it this way also keeps refs out of render, which
   * the react-hooks/refs rule (correctly) rejects.
   */
  setCommit(commit: (value: T) => void): void;
  /** Record the latest value and (re)arm the debounce. Newest value wins. */
  push(value: T): void;
  /** Commit the pending value now, if there is one. Safe to call when empty. */
  flush(): void;
  /** Discard the pending value without committing. */
  cancel(): void;
  hasPending(): boolean;
}

export interface AutosaveSchedulerOptions {
  debounceMs?: number;
  maxWaitMs?: number;
  /** Injectable clock, so tests do not depend on wall time. */
  now?: () => number;
}

export function createAutosaveScheduler<T>(
  commit?: (value: T) => void,
  options: AutosaveSchedulerOptions = {}
): AutosaveScheduler<T> {
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS;
  const now = options.now ?? (() => Date.now());

  let commitFn: ((value: T) => void) | null = commit ?? null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let burstStartedAt: number | null = null;
  // Boxed so a legitimately falsy T (0, "", null) is still "pending".
  let pending: { value: T } | null = null;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function flush(): void {
    clearTimer();
    burstStartedAt = null;
    const captured = pending;
    if (captured === null) return;
    // No commit target yet (a flush racing the effect that installs it). Keep
    // the value pending rather than discarding it — losing prose is the whole
    // failure mode this module exists to prevent.
    if (commitFn === null) return;
    // Clear before committing: commit may synchronously push again (a save
    // handler that touches the document), and that new value must not be
    // dropped by this call's bookkeeping.
    pending = null;
    commitFn(captured.value);
  }

  return {
    setCommit(next: (value: T) => void): void {
      commitFn = next;
    },
    push(value: T): void {
      pending = { value };
      if (burstStartedAt === null) burstStartedAt = now();
      clearTimer();
      if (now() - burstStartedAt >= maxWaitMs) {
        flush();
        return;
      }
      timer = setTimeout(flush, debounceMs);
    },
    flush,
    cancel(): void {
      clearTimer();
      burstStartedAt = null;
      pending = null;
    },
    hasPending(): boolean {
      return pending !== null;
    },
  };
}
