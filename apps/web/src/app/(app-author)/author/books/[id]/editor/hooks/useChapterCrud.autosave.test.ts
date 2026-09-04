import { describe, it, expect } from "vitest";
import {
  drainPendingSaves,
  type PersistChapter,
  type PersistOutcome,
} from "./useChapterCrud.autosave";

/** Records every write in order, so tests assert on sequence, not just the last value. */
function recordingPersist(
  onWrite?: (chapterId: string, payload: Record<string, unknown>) => void,
  outcomeFor?: (chapterId: string, payload: Record<string, unknown>) => PersistOutcome
) {
  const writes: Array<{ chapterId: string; body: string }> = [];
  const persist: PersistChapter = async (chapterId, payload) => {
    const serialized = JSON.stringify(payload);
    writes.push({ chapterId, body: String(payload.body ?? serialized) });
    // Hook for simulating a keystroke that lands while this write is awaiting.
    onWrite?.(chapterId, payload);
    return { outcome: outcomeFor?.(chapterId, payload) ?? "written", serialized };
  };
  return { persist, writes };
}

describe("drainPendingSaves", () => {
  it("writes nothing when the queue is empty", async () => {
    const { persist, writes } = recordingPersist();
    const result = await drainPendingSaves(new Map(), persist);
    expect(writes).toEqual([]);
    expect(result.saved.size).toBe(0);
    expect(result.transientFailures).toEqual([]);
    expect(result.missingChapters).toEqual([]);
  });

  // The old loop only re-read the key for the chapter it was saving, so a
  // chapter the author had switched away from was never written at all.
  it("drains every queued chapter, not just one", async () => {
    const { persist, writes } = recordingPersist();
    const pending = new Map<string, Record<string, unknown>>([
      ["a", { body: "a1" }],
      ["b", { body: "b1" }],
      ["c", { body: "c1" }],
    ]);

    const result = await drainPendingSaves(pending, persist);

    expect(writes.map((w) => w.chapterId).sort()).toEqual(["a", "b", "c"]);
    expect(pending.size).toBe(0);
    expect(result.saved.size).toBe(3);
  });

  // REGRESSION 1. The exact sequence that overwrote newer prose with older:
  // content queued for B while A is being written, then a newer edit to B
  // arrives while B is being written. The stale payload must never land last.
  it("never writes an older payload after a newer one for the same chapter", async () => {
    const pending = new Map<string, Record<string, unknown>>([["a", { body: "a1" }]]);

    const { persist, writes } = recordingPersist((chapterId) => {
      // While A is in flight the author switches to B and types. Under the old
      // code this entry outlived A's drain.
      if (chapterId === "a") pending.set("b", { body: "b-OLD" });
      // While B is in flight the author types again in B. Newer, must survive.
      if (chapterId === "b" && !writes.some((w) => w.body === "b-NEW")) {
        pending.set("b", { body: "b-NEW" });
      }
    });

    await drainPendingSaves(pending, persist);

    const bWrites = writes.filter((w) => w.chapterId === "b").map((w) => w.body);
    expect(bWrites).toContain("b-NEW");
    expect(bWrites[bWrites.length - 1]).toBe("b-NEW");
    expect(pending.size).toBe(0);
  });

  // REGRESSION 2, found by codex review of the first cut of this fix. A Map
  // iterates in insertion order, so a chapter that can never be written sits at
  // the head of the queue. Stopping the drain there stranded every valid chapter
  // behind it — the author's edits in a live chapter were never written at all,
  // and were lost the moment they navigated away.
  it("does not let a permanently missing chapter block a valid one behind it", async () => {
    const pending = new Map<string, Record<string, unknown>>([
      ["deleted-by-import", { body: "gone" }],
      ["live-chapter", { body: "real work" }],
    ]);
    const { persist, writes } = recordingPersist(undefined, (id) =>
      id === "deleted-by-import" ? "missing" : "written"
    );

    const result = await drainPendingSaves(pending, persist);

    expect(writes.map((w) => w.chapterId)).toContain("live-chapter");
    expect(result.saved.get("live-chapter")).toBe(JSON.stringify({ body: "real work" }));
    expect(result.missingChapters).toEqual(["deleted-by-import"]);
    // Kept, not dropped. Zero rows cannot tell deletion apart from lost access,
    // so discarding it would risk losing prose over a recoverable problem. It
    // does not block anything, because failures are skipped for the rest of the
    // pass — which is the property this test actually guards.
    expect(pending.get("deleted-by-import")).toEqual({ body: "gone" });
  });

  // Found by codex review. A newer payload landing during a failed write must
  // survive the re-queue, for a missing outcome exactly as for a transient one.
  it("lets a newer payload win over the re-queue when a write matched no row", async () => {
    const pending = new Map<string, Record<string, unknown>>([["a", { body: "old" }]]);
    const { persist } = recordingPersist(
      (chapterId) => {
        if (chapterId === "a") pending.set("a", { body: "newer" });
      },
      () => "missing"
    );

    const result = await drainPendingSaves(pending, persist);

    expect(result.missingChapters).toEqual(["a"]);
    expect(pending.get("a")).toEqual({ body: "newer" });
  });

  // Found by codex review. A drain can contain both outcomes, and the caller
  // reports the more serious one, so both must come back populated.
  it("reports transient and missing failures separately in one pass", async () => {
    const pending = new Map<string, Record<string, unknown>>([
      ["flaky", { body: "retry" }],
      ["gone", { body: "vanished" }],
      ["fine", { body: "ok" }],
    ]);
    const { persist } = recordingPersist(undefined, (id) => {
      if (id === "flaky") return "transient";
      if (id === "gone") return "missing";
      return "written";
    });

    const result = await drainPendingSaves(pending, persist);

    expect(result.transientFailures).toEqual(["flaky"]);
    expect(result.missingChapters).toEqual(["gone"]);
    expect(result.saved.get("fine")).toBe(JSON.stringify({ body: "ok" }));
  });

  it("does not let a transient failure block other chapters either", async () => {
    const pending = new Map<string, Record<string, unknown>>([
      ["flaky", { body: "retry me" }],
      ["fine", { body: "write me" }],
    ]);
    const { persist, writes } = recordingPersist(undefined, (id) =>
      id === "flaky" ? "transient" : "written"
    );

    const result = await drainPendingSaves(pending, persist);

    expect(writes.map((w) => w.chapterId)).toEqual(["flaky", "fine"]);
    expect(result.saved.get("fine")).toBe(JSON.stringify({ body: "write me" }));
    expect(result.transientFailures).toEqual(["flaky"]);
    // Retryable, so it stays queued — but it did not stop "fine" being written.
    expect(pending.get("flaky")).toEqual({ body: "retry me" });
  });

  it("attempts a failed chapter only once per pass, so a re-queue cannot spin", async () => {
    const pending = new Map<string, Record<string, unknown>>([["flaky", { body: "x" }]]);
    const { persist, writes } = recordingPersist(undefined, () => "transient");

    const result = await drainPendingSaves(pending, persist);

    expect(writes).toHaveLength(1);
    expect(result.transientFailures).toEqual(["flaky"]);
    expect(pending.get("flaky")).toEqual({ body: "x" });
  });

  it("supersedes a queued payload when a newer one arrives for the same chapter", async () => {
    const pending = new Map<string, Record<string, unknown>>([["a", { body: "v1" }]]);
    const { persist, writes } = recordingPersist((chapterId, payload) => {
      if (chapterId === "a" && payload.body === "v1") {
        pending.set("a", { body: "v2" });
        pending.set("a", { body: "v3" });
      }
    });

    await drainPendingSaves(pending, persist);

    // v2 is replaced in the map by v3 before the loop returns for it, so it is
    // never written — newest-wins rather than writing every intermediate state.
    expect(writes.map((w) => w.body)).toEqual(["v1", "v3"]);
  });

  it("re-queues a transient failure so the content is not lost", async () => {
    const pending = new Map<string, Record<string, unknown>>([["a", { body: "unsaved" }]]);
    const { persist } = recordingPersist(undefined, () => "transient");

    const result = await drainPendingSaves(pending, persist);

    expect(result.transientFailures).toEqual(["a"]);
    expect(result.saved.size).toBe(0);
    expect(pending.get("a")).toEqual({ body: "unsaved" });
  });

  it("lets a newer payload win over the re-queue when a write fails", async () => {
    const pending = new Map<string, Record<string, unknown>>([["a", { body: "old" }]]);
    const { persist } = recordingPersist(
      (chapterId) => {
        // A keystroke lands while the doomed write is in flight.
        if (chapterId === "a") pending.set("a", { body: "newer" });
      },
      () => "transient"
    );

    const result = await drainPendingSaves(pending, persist);

    expect(result.transientFailures).toEqual(["a"]);
    // The re-queue must not clobber the newer content with what just failed.
    expect(pending.get("a")).toEqual({ body: "newer" });
  });

  it("still writes fresh content that arrives for an already-saved chapter", async () => {
    const pending = new Map<string, Record<string, unknown>>([["a", { body: "first" }]]);
    let pushed = false;
    const { persist, writes } = recordingPersist((chapterId) => {
      if (chapterId === "a" && !pushed) {
        pushed = true;
        pending.set("a", { body: "second" });
      }
    });

    await drainPendingSaves(pending, persist);

    // A success does not block the chapter for the rest of the pass, so content
    // typed during the write is written before the drain ends.
    expect(writes.map((w) => w.body)).toEqual(["first", "second"]);
    expect(pending.size).toBe(0);
  });

  it("returns the exact serialized body written, for optimistic local state", async () => {
    const pending = new Map<string, Record<string, unknown>>([
      ["a", { body: "hello", extra: 1 }],
    ]);
    const { persist } = recordingPersist();

    const result = await drainPendingSaves(pending, persist);

    expect(result.saved.get("a")).toBe(JSON.stringify({ body: "hello", extra: 1 }));
  });
});
