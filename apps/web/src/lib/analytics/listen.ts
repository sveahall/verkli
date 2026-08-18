/**
 * Listening telemetry contract (WP-03) — shared by the reader audio players and
 * `POST /api/books/[id]/audiobook/progress`.
 *
 * Kept free of React and of server-only imports so the client hook, the route
 * handler and the tests can all use the same constants and validators. If the
 * client and the server disagree about the shape of this payload the reader
 * silently loses their place, so there is exactly one definition of it.
 */

/** Client-emitted listening events. `audio_requested` is server-side only. */
export const LISTEN_EVENT_TYPES = [
  "listen_start",
  "listen_progress",
  "listen_complete",
] as const;

export type ListenEventType = (typeof LISTEN_EVENT_TYPES)[number];

export function isListenEventType(value: unknown): value is ListenEventType {
  return (
    typeof value === "string" &&
    (LISTEN_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Playback seconds between `listen_progress` emissions.
 *
 * `timeupdate` fires roughly 4x/second, so a 20-minute chapter would produce
 * ~4800 events per listener. Sixty seconds of *played* audio was chosen over
 * the two obvious alternatives:
 *
 * - **Quartile milestones (25/50/75%)** give only four data points and cannot
 *   answer the question that actually matters for a launch — "do readers bail
 *   in the first minute?" — because the first sample lands minutes in.
 * - **30s**, the common video-analytics default, doubles the write volume for
 *   no extra insight at Verkli's 5–20 minute chapter lengths.
 *
 * At 60s a full chapter yields 5–20 rows, enough to plot a per-minute drop-off
 * curve, and `analytics_events` is the same table the launch funnel reads, so
 * row count is not free.
 *
 * Measured in *played* seconds, not wall-clock: a paused tab emits nothing, and
 * seeking cannot manufacture progress (see the seek handling in
 * `useListenTracking`).
 */
export const LISTEN_PROGRESS_INTERVAL_SECONDS = 60;

/**
 * Position write cadence while audio is playing. More frequent than the
 * analytics interval because a lost position is user-visible (you lose your
 * place) whereas a lost analytics row is merely a gap in a chart. 15s bounds
 * the worst-case loss on a hard crash at 15 seconds of audio, at 4 writes per
 * minute — modest next to the text reader, whose 2s-debounced upsert can reach
 * 30 writes per minute on a fast scroll.
 */
export const POSITION_SAVE_INTERVAL_MS = 15_000;

/**
 * Debounce for position writes triggered by pause and seek. Matches
 * `ReadingProgress.PERSIST_DEBOUNCE_MS` on purpose: dragging the scrubber emits
 * a burst of `seeked` events exactly the way scrolling emits a burst of
 * progress changes, and the text reader already settled on 2s for that.
 */
export const POSITION_SAVE_DEBOUNCE_MS = 2_000;

/**
 * Positions below this are not worth restoring — resuming someone at 00:03
 * is indistinguishable from a bug.
 */
export const RESUME_MIN_SECONDS = 5;

/**
 * A position this close to the end means the chapter was finished; restart it
 * instead of resuming to the closing seconds.
 */
export const RESUME_TAIL_MARGIN_SECONDS = 15;

/** Body of `POST /api/books/[id]/audiobook/progress`. */
export type ListenProgressRequest = {
  chapterId: string;
  positionSeconds: number;
  /** Total chapter length, when the media element has reported it yet. */
  durationSeconds?: number | null;
  /**
   * Omitted for a pure position save (pause, seek, unmount). Present only when
   * this write should also produce an analytics row, so the two cadences above
   * can differ without a second round trip.
   */
  event?: ListenEventType | null;
};

/** Response of `POST /api/books/[id]/audiobook/progress`. */
export type ListenProgressResponse = {
  ok: true;
  /** False when the position could not be stored (e.g. migration not applied). */
  saved: boolean;
};

/**
 * Smallest position change worth a write. Below this the reader has not really
 * moved and the row would only churn `updated_at`.
 */
export const MIN_POSITION_DELTA_SECONDS = 1;

/** What a single `timeupdate` should cause, if anything. */
export type ListenWriteDecision =
  | { kind: "idle" }
  | { kind: "save" }
  | { kind: "event"; event: ListenEventType };

/**
 * The whole throttling policy, as a pure function so it can be tested without a
 * DOM (the test environment is `node`; there is no jsdom in this project).
 *
 * `timeupdate` fires ~4x/second, so the default answer is `idle`. A progress
 * event wins over a plain save when both are due, because it carries the
 * position anyway — one request, not two.
 *
 * Progress is gated on *played* seconds since the last event rather than on
 * elapsed wall-clock, which is what makes a paused tab emit nothing. It is a
 * signed comparison on purpose: after a backward seek the difference is
 * negative, so rewinding never manufactures progress.
 */
export function decideTimeUpdateWrite(input: {
  positionSeconds: number;
  lastEventPositionSeconds: number;
  lastSavedPositionSeconds: number;
  msSinceLastSave: number;
}): ListenWriteDecision {
  const {
    positionSeconds,
    lastEventPositionSeconds,
    lastSavedPositionSeconds,
    msSinceLastSave,
  } = input;

  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
    return { kind: "idle" };
  }

  if (positionSeconds - lastEventPositionSeconds >= LISTEN_PROGRESS_INTERVAL_SECONDS) {
    return { kind: "event", event: "listen_progress" };
  }

  if (
    msSinceLastSave >= POSITION_SAVE_INTERVAL_MS &&
    Math.abs(positionSeconds - lastSavedPositionSeconds) >= MIN_POSITION_DELTA_SECONDS
  ) {
    return { kind: "save" };
  }

  return { kind: "idle" };
}

/**
 * Whether a position differs enough from the last write to be worth storing.
 *
 * Guards the pause and seek paths. Restoring a saved offset seeks the element,
 * which fires `seeked`, which would otherwise write straight back the value the
 * server just handed us. Unlike the unload flush this does *not* require a
 * positive position: a reader who rewinds all the way to the start means it, and
 * leaving the old offset on the row would teleport them forward next time.
 */
export function shouldWritePosition(input: {
  positionSeconds: number;
  lastSavedPositionSeconds: number;
}): boolean {
  const { positionSeconds, lastSavedPositionSeconds } = input;
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return false;
  return Math.abs(positionSeconds - lastSavedPositionSeconds) >= MIN_POSITION_DELTA_SECONDS;
}

/**
 * Whether the last-chance write on unmount / `pagehide` is worth sending.
 * Skipped when nothing ever played — otherwise every chapter page view that
 * merely *loaded* audio would store a position of 0 — and when a periodic write
 * already covered this position, which would double-write on every tab close.
 */
export function shouldFlushOnUnload(input: {
  positionSeconds: number;
  lastSavedPositionSeconds: number;
}): boolean {
  if (!Number.isFinite(input.positionSeconds) || input.positionSeconds <= 0) return false;
  return shouldWritePosition(input);
}

/**
 * True when `positionSeconds` is far enough into the chapter to be worth
 * resuming, and not so close to the end that the chapter is effectively done.
 * Duration may be unknown (the reader never reached `loadedmetadata` on the
 * previous visit), in which case only the lower bound applies.
 */
export function shouldResumeAt(
  positionSeconds: number | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (typeof positionSeconds !== "number" || !Number.isFinite(positionSeconds)) {
    return false;
  }
  if (positionSeconds < RESUME_MIN_SECONDS) return false;
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return positionSeconds < durationSeconds - RESUME_TAIL_MARGIN_SECONDS;
  }
  return true;
}

/**
 * Fraction of the chapter played, 0–1, or null when duration is unknown.
 * Stored in the analytics props so a drop-off curve can be plotted without
 * joining back to `chapter_audio_cache` for the chapter length.
 */
export function listenPercent(
  positionSeconds: number,
  durationSeconds: number | null | undefined
): number | null {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  const ratio = positionSeconds / durationSeconds;
  if (!Number.isFinite(ratio)) return null;
  return Math.round(Math.min(Math.max(ratio, 0), 1) * 1000) / 1000;
}
