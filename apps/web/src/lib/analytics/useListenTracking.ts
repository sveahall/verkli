"use client";

/**
 * useListenTracking — instruments an <audio> element for WP-03.
 *
 * Returns a set of media handlers to spread onto the element. They do two
 * things, both throttled, both best-effort:
 *
 *   - restore the reader's saved offset the first time metadata loads, and keep
 *     that offset up to date as they listen, pause, seek and leave;
 *   - emit `listen_start` / `listen_progress` / `listen_complete`, the events
 *     that did not exist anywhere in the app before this.
 *
 * Both go through `POST /api/books/[id]/audiobook/progress`; nothing here talks
 * to Supabase directly. The client cannot be trusted to write analytics (see the
 * RLS note in `lib/analytics/events.ts`) and the route is where the access check
 * lives.
 *
 * Every write is fire-and-forget. Failing telemetry must never interrupt
 * playback, so nothing here surfaces an error to the reader.
 */

import { useCallback, useEffect, useRef, type ComponentPropsWithoutRef, type SyntheticEvent } from "react";
import {
  POSITION_SAVE_DEBOUNCE_MS,
  decideTimeUpdateWrite,
  shouldFlushOnUnload,
  shouldResumeAt,
  shouldWritePosition,
  type ListenEventType,
  type ListenProgressRequest,
} from "@/lib/analytics/listen";

/** The subset of media props this hook drives. Spread onto an <audio>. */
export type ListenTrackingHandlers = Required<
  Pick<
    ComponentPropsWithoutRef<"audio">,
    "onLoadedMetadata" | "onPlay" | "onPause" | "onTimeUpdate" | "onSeeked" | "onEnded"
  >
>;

type Input = {
  bookId: string;
  chapterId: string;
  /** False disables every handler — feature flag off, or no audio resolved yet. */
  enabled: boolean;
  /** Saved offset from the play route, or null for "start at the beginning". */
  resumePositionSeconds: number | null;
};

type TrackerState = {
  /** Offset the play route told us to resume at, until it has been applied. */
  pendingResumeSeconds: number | null;
  startEmitted: boolean;
  completeEmitted: boolean;
  /** Position at the last emitted analytics event; the progress-interval anchor. */
  lastEventPositionSeconds: number;
  lastSavedPositionSeconds: number;
  lastSaveAtMs: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** Latest values seen, so the unload flush has something to send. */
  lastKnownPositionSeconds: number;
  lastKnownDurationSeconds: number | null;
};

function freshState(resumePositionSeconds: number | null): TrackerState {
  return {
    pendingResumeSeconds: resumePositionSeconds,
    startEmitted: false,
    completeEmitted: false,
    lastEventPositionSeconds: 0,
    lastSavedPositionSeconds: -1,
    lastSaveAtMs: 0,
    debounceTimer: null,
    lastKnownPositionSeconds: 0,
    lastKnownDurationSeconds: null,
  };
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function useListenTracking({
  bookId,
  chapterId,
  enabled,
  resumePositionSeconds,
}: Input): ListenTrackingHandlers {
  const stateRef = useRef<TrackerState>(freshState(resumePositionSeconds));

  // Reset per chapter. Written in an effect, never during render: the React
  // compiler forbids touching refs in the render phase, and a stale tracker
  // would attribute the previous chapter's progress to the new one.
  useEffect(() => {
    const previous = stateRef.current;
    if (previous.debounceTimer) clearTimeout(previous.debounceTimer);
    stateRef.current = freshState(resumePositionSeconds);
    // `bookId` participates so switching books is also a reset, even in the
    // (currently impossible) case of the same chapterId under a different book.
  }, [bookId, chapterId, resumePositionSeconds]);

  const send = useCallback(
    (body: ListenProgressRequest, options?: { beacon?: boolean }) => {
      const url = `/api/books/${bookId}/audiobook/progress`;
      const json = JSON.stringify(body);

      // On unload only sendBeacon is guaranteed to survive the navigation. It is
      // same-origin so the session cookie rides along, which is what the route
      // authenticates on.
      if (options?.beacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const queued = navigator.sendBeacon(url, new Blob([json], { type: "application/json" }));
        if (queued) return;
        // Fall through to keepalive fetch when the beacon queue is full.
      }

      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: Boolean(options?.beacon),
      }).catch(() => {
        // Telemetry and a resume point are both expendable; playback is not.
      });
    },
    [bookId]
  );

  /** Records a write against the tracker and posts it. */
  const write = useCallback(
    (
      state: TrackerState,
      positionSeconds: number,
      durationSeconds: number | null,
      event: ListenEventType | null,
      options?: { beacon?: boolean }
    ) => {
      state.lastSavedPositionSeconds = positionSeconds;
      state.lastSaveAtMs = Date.now();
      if (event) state.lastEventPositionSeconds = positionSeconds;
      send({ chapterId, positionSeconds, durationSeconds, event }, options);
    },
    [chapterId, send]
  );

  /** Cancels any queued debounced save, then queues a fresh one. */
  const queueDebouncedSave = useCallback(
    (state: TrackerState, positionSeconds: number, durationSeconds: number | null) => {
      // Nothing moved since the last write. Notably this is what stops the seek
      // fired by restoring a saved offset from writing that offset straight back.
      if (
        !shouldWritePosition({
          positionSeconds,
          lastSavedPositionSeconds: state.lastSavedPositionSeconds,
        })
      ) {
        return;
      }
      if (state.debounceTimer) clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(() => {
        state.debounceTimer = null;
        write(state, positionSeconds, durationSeconds, null);
      }, POSITION_SAVE_DEBOUNCE_MS);
    },
    [write]
  );

  const onLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLAudioElement>) => {
      if (!enabled) return;
      const el = event.currentTarget;
      const state = stateRef.current;
      const duration = finiteOrNull(el.duration);
      state.lastKnownDurationSeconds = duration;

      const pending = state.pendingResumeSeconds;
      if (pending == null) return;
      // Applied at most once. Clearing it first means a reader who deliberately
      // scrubs back to 0 is never yanked forward again by a later metadata load.
      state.pendingResumeSeconds = null;
      if (!shouldResumeAt(pending, duration)) return;

      try {
        el.currentTime = pending;
        state.lastKnownPositionSeconds = pending;
        state.lastEventPositionSeconds = pending;
        state.lastSavedPositionSeconds = pending;
      } catch {
        // Seeking can throw when the response has no Range support. Starting
        // from the top is a worse experience, not a broken one.
      }
    },
    [enabled]
  );

  const onPlay = useCallback(
    (event: SyntheticEvent<HTMLAudioElement>) => {
      if (!enabled) return;
      const el = event.currentTarget;
      const state = stateRef.current;
      if (state.startEmitted) return;

      // With preload="none" `play` fires before any metadata exists, so
      // currentTime is still 0 and duration NaN. When a resume is pending,
      // playback is about to begin at that offset, so that is the honest
      // position to report for "the reader pressed play".
      const position =
        el.currentTime > 0 ? el.currentTime : (state.pendingResumeSeconds ?? 0);
      state.startEmitted = true;
      state.lastKnownPositionSeconds = position;
      write(state, position, state.lastKnownDurationSeconds ?? finiteOrNull(el.duration), "listen_start");
    },
    [enabled, write]
  );

  const onTimeUpdate = useCallback(
    (event: SyntheticEvent<HTMLAudioElement>) => {
      if (!enabled) return;
      const el = event.currentTarget;
      const state = stateRef.current;
      const position = el.currentTime;
      if (!Number.isFinite(position)) return;

      const duration = finiteOrNull(el.duration) ?? state.lastKnownDurationSeconds;
      state.lastKnownPositionSeconds = position;
      state.lastKnownDurationSeconds = duration;

      // `timeupdate` fires ~4x/second; `decideTimeUpdateWrite` is the throttle.
      // The policy lives in listen.ts so it can be tested without a DOM.
      const decision = decideTimeUpdateWrite({
        positionSeconds: position,
        lastEventPositionSeconds: state.lastEventPositionSeconds,
        lastSavedPositionSeconds: state.lastSavedPositionSeconds,
        msSinceLastSave: Date.now() - state.lastSaveAtMs,
      });

      if (decision.kind === "event") {
        write(state, position, duration, decision.event);
      } else if (decision.kind === "save") {
        write(state, position, duration, null);
      }
    },
    [enabled, write]
  );

  const onPause = useCallback(
    (event: SyntheticEvent<HTMLAudioElement>) => {
      if (!enabled) return;
      const el = event.currentTarget;
      const state = stateRef.current;
      const position = el.currentTime;
      if (!Number.isFinite(position)) return;
      state.lastKnownPositionSeconds = position;
      // Debounced for the same reason ReadingProgress debounces: pause/play
      // fiddling produces a burst, and only the last position matters.
      queueDebouncedSave(state, position, state.lastKnownDurationSeconds);
    },
    [enabled, queueDebouncedSave]
  );

  const onSeeked = useCallback(
    (event: SyntheticEvent<HTMLAudioElement>) => {
      if (!enabled) return;
      const el = event.currentTarget;
      const state = stateRef.current;
      const position = el.currentTime;
      if (!Number.isFinite(position)) return;
      state.lastKnownPositionSeconds = position;
      // Re-anchor the progress interval on the new position. Without this a
      // reader who drags the scrubber forward five minutes would immediately
      // trip the 60s threshold and `listen_progress` would measure scrubbing
      // rather than listening.
      state.lastEventPositionSeconds = position;
      queueDebouncedSave(state, position, state.lastKnownDurationSeconds);
    },
    [enabled, queueDebouncedSave]
  );

  const onEnded = useCallback(
    (event: SyntheticEvent<HTMLAudioElement>) => {
      if (!enabled) return;
      const el = event.currentTarget;
      const state = stateRef.current;
      if (state.completeEmitted) return;
      state.completeEmitted = true;
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
      }
      const duration = finiteOrNull(el.duration) ?? state.lastKnownDurationSeconds;
      const position = Number.isFinite(el.currentTime) ? el.currentTime : (duration ?? 0);
      state.lastKnownPositionSeconds = position;
      write(state, position, duration, "listen_complete");
    },
    [enabled, write]
  );

  // Final flush. Covers tab close and backgrounding (`pagehide`, which unlike
  // `beforeunload` also fires on iOS Safari) as well as unmount, which is how
  // chapter-to-chapter navigation looks from here.
  useEffect(() => {
    if (!enabled) return;

    const flush = () => {
      const state = stateRef.current;
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
      }
      const position = state.lastKnownPositionSeconds;
      if (
        !shouldFlushOnUnload({
          positionSeconds: position,
          lastSavedPositionSeconds: state.lastSavedPositionSeconds,
        })
      ) {
        return;
      }
      write(state, position, state.lastKnownDurationSeconds, null, { beacon: true });
    };

    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [enabled, write]);

  return { onLoadedMetadata, onPlay, onPause, onTimeUpdate, onSeeked, onEnded };
}
