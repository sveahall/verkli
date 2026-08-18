import { describe, expect, it } from "vitest";
import {
  LISTEN_EVENT_TYPES,
  LISTEN_PROGRESS_INTERVAL_SECONDS,
  MIN_POSITION_DELTA_SECONDS,
  POSITION_SAVE_INTERVAL_MS,
  RESUME_MIN_SECONDS,
  RESUME_TAIL_MARGIN_SECONDS,
  decideTimeUpdateWrite,
  isListenEventType,
  listenPercent,
  shouldFlushOnUnload,
  shouldResumeAt,
  shouldWritePosition,
} from "./listen";

/** Defaults chosen so each test only states the field it is exercising. */
function timeUpdate(overrides: Partial<Parameters<typeof decideTimeUpdateWrite>[0]>) {
  return decideTimeUpdateWrite({
    positionSeconds: 0,
    lastEventPositionSeconds: 0,
    lastSavedPositionSeconds: 0,
    msSinceLastSave: 0,
    ...overrides,
  });
}

describe("decideTimeUpdateWrite — throttling policy", () => {
  it("stays idle on the ~4/sec timeupdate firehose", () => {
    // 0.25s later, 0.25s further in: the common case, and it must cost nothing.
    expect(
      timeUpdate({ positionSeconds: 0.25, msSinceLastSave: 250 })
    ).toEqual({ kind: "idle" });
  });

  it("emits listen_progress once a full interval of audio has played", () => {
    expect(
      timeUpdate({ positionSeconds: LISTEN_PROGRESS_INTERVAL_SECONDS })
    ).toEqual({ kind: "event", event: "listen_progress" });
  });

  it("does not emit listen_progress one tick early", () => {
    expect(
      timeUpdate({ positionSeconds: LISTEN_PROGRESS_INTERVAL_SECONDS - 0.25 })
    ).toEqual({ kind: "idle" });
  });

  it("anchors the interval on the last event, not on zero", () => {
    // Already emitted at 60s; 119s must not fire again, 120s must.
    expect(
      timeUpdate({ positionSeconds: 119, lastEventPositionSeconds: 60, lastSavedPositionSeconds: 119 })
    ).toEqual({ kind: "idle" });
    expect(
      timeUpdate({ positionSeconds: 120, lastEventPositionSeconds: 60 })
    ).toEqual({ kind: "event", event: "listen_progress" });
  });

  it("cannot be tricked into progress by seeking backward", () => {
    // Listener was at 600s, dragged back to 120s. The delta is -480, and a naive
    // Math.abs() here would report eight minutes of listening that never happened.
    expect(
      timeUpdate({
        positionSeconds: 120,
        lastEventPositionSeconds: 600,
        lastSavedPositionSeconds: 120,
        msSinceLastSave: 100,
      })
    ).toEqual({ kind: "idle" });
  });

  it("saves the position on the slower interval when no event is due", () => {
    expect(
      timeUpdate({
        positionSeconds: 20,
        lastEventPositionSeconds: 5,
        lastSavedPositionSeconds: 5,
        msSinceLastSave: POSITION_SAVE_INTERVAL_MS,
      })
    ).toEqual({ kind: "save" });
  });

  it("does not save before the interval elapses", () => {
    expect(
      timeUpdate({
        positionSeconds: 20,
        lastSavedPositionSeconds: 5,
        msSinceLastSave: POSITION_SAVE_INTERVAL_MS - 1,
      })
    ).toEqual({ kind: "idle" });
  });

  it("does not save when the position has barely moved", () => {
    // A stalled or looping-in-place element must not churn the row.
    expect(
      timeUpdate({
        positionSeconds: 20,
        lastSavedPositionSeconds: 20 - MIN_POSITION_DELTA_SECONDS / 2,
        msSinceLastSave: POSITION_SAVE_INTERVAL_MS * 10,
      })
    ).toEqual({ kind: "idle" });
  });

  it("prefers the event over a plain save when both are due — one request", () => {
    expect(
      timeUpdate({
        positionSeconds: 300,
        lastEventPositionSeconds: 100,
        lastSavedPositionSeconds: 100,
        msSinceLastSave: POSITION_SAVE_INTERVAL_MS * 5,
      })
    ).toEqual({ kind: "event", event: "listen_progress" });
  });

  it("ignores NaN and negative currentTime", () => {
    expect(timeUpdate({ positionSeconds: Number.NaN })).toEqual({ kind: "idle" });
    expect(timeUpdate({ positionSeconds: Number.POSITIVE_INFINITY })).toEqual({ kind: "idle" });
    expect(timeUpdate({ positionSeconds: -1 })).toEqual({ kind: "idle" });
  });
});

describe("shouldWritePosition", () => {
  it("skips the write when the position has not moved", () => {
    // This is what stops the seek fired by restoring a saved offset from
    // immediately writing that same offset back to the row.
    expect(shouldWritePosition({ positionSeconds: 312.5, lastSavedPositionSeconds: 312.5 })).toBe(false);
  });

  it("writes a genuine move", () => {
    expect(shouldWritePosition({ positionSeconds: 320, lastSavedPositionSeconds: 312.5 })).toBe(true);
  });

  it("writes a rewind all the way to the start", () => {
    // Unlike the unload flush, zero is a legitimate position here: leaving the
    // old offset on the row would teleport the reader forward next visit.
    expect(shouldWritePosition({ positionSeconds: 0, lastSavedPositionSeconds: 300 })).toBe(true);
  });

  it("rejects NaN and negative positions", () => {
    expect(shouldWritePosition({ positionSeconds: Number.NaN, lastSavedPositionSeconds: 0 })).toBe(false);
    expect(shouldWritePosition({ positionSeconds: -5, lastSavedPositionSeconds: 300 })).toBe(false);
  });
});

describe("shouldFlushOnUnload", () => {
  it("skips the flush when nothing ever played", () => {
    expect(shouldFlushOnUnload({ positionSeconds: 0, lastSavedPositionSeconds: -1 })).toBe(false);
  });

  it("skips the flush when a periodic write already covered this position", () => {
    expect(shouldFlushOnUnload({ positionSeconds: 42, lastSavedPositionSeconds: 42 })).toBe(false);
  });

  it("flushes unsaved progress on unmount", () => {
    expect(shouldFlushOnUnload({ positionSeconds: 42, lastSavedPositionSeconds: 30 })).toBe(true);
  });

  it("flushes after a backward seek that was never written", () => {
    expect(shouldFlushOnUnload({ positionSeconds: 30, lastSavedPositionSeconds: 600 })).toBe(true);
  });
});

describe("shouldResumeAt", () => {
  it("ignores a position too close to the start to be meaningful", () => {
    expect(shouldResumeAt(RESUME_MIN_SECONDS - 0.1, 600)).toBe(false);
  });

  it("resumes a genuine mid-chapter position", () => {
    expect(shouldResumeAt(300, 600)).toBe(true);
  });

  it("restarts a chapter that was effectively finished", () => {
    expect(shouldResumeAt(600 - RESUME_TAIL_MARGIN_SECONDS + 1, 600)).toBe(false);
  });

  it("resumes on the lower bound alone when duration is unknown", () => {
    // preload="none" lets a reader request audio and leave before
    // `loadedmetadata`, so a stored row can genuinely have no duration.
    expect(shouldResumeAt(300, null)).toBe(true);
    expect(shouldResumeAt(300, 0)).toBe(true);
    expect(shouldResumeAt(1, null)).toBe(false);
  });

  it("treats a missing or non-numeric position as nothing to resume", () => {
    expect(shouldResumeAt(null, 600)).toBe(false);
    expect(shouldResumeAt(undefined, 600)).toBe(false);
    expect(shouldResumeAt(Number.NaN, 600)).toBe(false);
  });
});

describe("listenPercent", () => {
  it("reports the played fraction at millesimal precision", () => {
    expect(listenPercent(150, 600)).toBe(0.25);
    expect(listenPercent(1, 3)).toBe(0.333);
  });

  it("clamps a position past the end to 1", () => {
    expect(listenPercent(700, 600)).toBe(1);
  });

  it("returns null rather than guessing when duration is unknown", () => {
    expect(listenPercent(150, null)).toBeNull();
    expect(listenPercent(150, undefined)).toBeNull();
    expect(listenPercent(150, 0)).toBeNull();
    expect(listenPercent(150, Number.NaN)).toBeNull();
  });
});

describe("isListenEventType", () => {
  it("accepts every client-emitted listen event", () => {
    for (const event of LISTEN_EVENT_TYPES) {
      expect(isListenEventType(event)).toBe(true);
    }
  });

  it("rejects the server-only audio_requested event", () => {
    // Only the play route may emit this; accepting it from a client body would
    // let anyone forge the unbypassable floor metric.
    expect(isListenEventType("audio_requested")).toBe(false);
  });

  it("rejects unrelated values", () => {
    expect(isListenEventType("book_view")).toBe(false);
    expect(isListenEventType("")).toBe(false);
    expect(isListenEventType(null)).toBe(false);
    expect(isListenEventType(42)).toBe(false);
  });
});
