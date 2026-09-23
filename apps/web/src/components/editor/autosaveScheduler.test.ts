import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createAutosaveScheduler,
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
} from "./autosaveScheduler";

describe("createAutosaveScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits once, with the newest value, after the debounce", () => {
    const commit = vi.fn();
    const s = createAutosaveScheduler<string>(commit, { now: () => Date.now() });

    s.push("a");
    s.push("b");
    s.push("c");
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("c");
  });

  // The bug this module exists for. A restart-on-every-keystroke debounce with
  // no ceiling never fires while the author keeps typing, so a long burst
  // produced zero saves. Type every 100ms forever and the plain debounce never
  // reaches its 500ms gap.
  it("commits during sustained typing that never pauses long enough to debounce", () => {
    const commit = vi.fn();
    const s = createAutosaveScheduler<number>(commit, { now: () => Date.now() });

    // 30 keystrokes, 100ms apart = 3s of unbroken typing, no gap ever reaching
    // AUTOSAVE_DEBOUNCE_MS.
    for (let i = 0; i < 30; i++) {
      s.push(i);
      vi.advanceTimersByTime(100);
    }

    expect(commit).toHaveBeenCalled();
    // The ceiling is what fired, so the first commit lands no later than
    // maxWait into the burst.
    const firstCommittedValue = commit.mock.calls[0][0] as number;
    expect(firstCommittedValue).toBeLessThanOrEqual(AUTOSAVE_MAX_WAIT_MS / 100);
  });

  // Found by codex review. The ceiling was only tested when `push` ran, so a
  // keystroke landing just under it armed a full debounce on top and committed
  // late — up to a whole debounce interval past the advertised hard ceiling.
  it("honours the ceiling exactly when a keystroke lands just under it", () => {
    const commit = vi.fn();
    const s = createAutosaveScheduler<string>(commit, {
      debounceMs: 500,
      maxWaitMs: 2000,
      now: () => Date.now(),
    });

    // Keep the burst alive: a keystroke every 100ms means the debounce is
    // re-armed before it can ever fire on its own.
    s.push("k0");
    for (let t = 100; t <= 1900; t += 100) {
      vi.advanceTimersByTime(100);
      s.push(`k${t}`);
    }

    // t = 1900. Nothing committed yet, and 100ms of ceiling remains.
    expect(commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    // Must land at 2000ms. Before the fix the 1900ms keystroke armed a fresh
    // full 500ms debounce on top, so this was still silent until 2400ms.
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("k1900");
  });

  it("never lets a burst run longer than maxWait without committing", () => {
    const commit = vi.fn();
    const s = createAutosaveScheduler<number>(commit, {
      debounceMs: 500,
      maxWaitMs: 2000,
      now: () => Date.now(),
    });

    for (let i = 0; i < 100; i++) {
      s.push(i);
      vi.advanceTimersByTime(50);
    }
    // 5s of typing at 50ms intervals. With a 2s ceiling that is at least two
    // commits; the exact count is timing detail, the floor is the guarantee.
    expect(commit.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // The unmount path. Clearing the timer without flushing is what silently
  // discarded everything typed since the last pause, on every chapter switch.
  it("flush commits a pending value that the debounce has not fired yet", () => {
    const commit = vi.fn();
    const s = createAutosaveScheduler<string>(commit);

    s.push("typed but not yet saved");
    expect(commit).not.toHaveBeenCalled();

    s.flush();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("typed but not yet saved");
  });

  it("flush is a no-op when nothing is pending, and does not double-commit", () => {
    const commit = vi.fn();
    const s = createAutosaveScheduler<string>(commit);

    s.flush();
    expect(commit).not.toHaveBeenCalled();

    s.push("x");
    s.flush();
    s.flush();
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 4);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("cancel discards the pending value and disarms the timer", () => {
    const commit = vi.fn();
    const s = createAutosaveScheduler<string>(commit);

    s.push("discard me");
    s.cancel();
    expect(s.hasPending()).toBe(false);

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 4);
    expect(commit).not.toHaveBeenCalled();
  });

  it("hasPending tracks whether a value is waiting", () => {
    const s = createAutosaveScheduler<string>(vi.fn());
    expect(s.hasPending()).toBe(false);
    s.push("a");
    expect(s.hasPending()).toBe(true);
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(s.hasPending()).toBe(false);
  });

  // A save handler can touch the document and push again. That value must
  // survive rather than be cleared by the commit that triggered it.
  it("keeps a value pushed from inside commit", () => {
    const seen: string[] = [];
    // setCommit rather than a constructor arg, so the commit can close over `s`
    // without a forward reference.
    const s = createAutosaveScheduler<string>();
    s.setCommit((v) => {
      seen.push(v);
      if (v === "first") s.push("reentrant");
    });

    s.push("first");
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(seen).toEqual(["first"]);
    expect(s.hasPending()).toBe(true);

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);
    expect(seen).toEqual(["first", "reentrant"]);
  });

  // The React caller installs the commit from an effect, so a push can in
  // principle beat it. Dropping the value there would be the exact failure this
  // module exists to prevent, so it stays pending instead.
  it("keeps the value pending when no commit target is installed yet", () => {
    const s = createAutosaveScheduler<string>();
    s.push("typed before the effect ran");
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 4);
    expect(s.hasPending()).toBe(true);

    const commit = vi.fn();
    s.setCommit(commit);
    s.flush();
    expect(commit).toHaveBeenCalledWith("typed before the effect ran");
  });

  it("commits to the most recently installed target", () => {
    const first = vi.fn();
    const second = vi.fn();
    const s = createAutosaveScheduler<string>(first);

    s.setCommit(second);
    s.push("x");
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("x");
  });

  it("treats a falsy value as pending", () => {
    const commit = vi.fn();
    const s = createAutosaveScheduler<string>(commit);
    s.push("");
    expect(s.hasPending()).toBe(true);
    s.flush();
    expect(commit).toHaveBeenCalledWith("");
  });
});
