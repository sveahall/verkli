import { describe, it, expect } from "vitest";
import { drainPendingSaves, type PersistChapter } from "./useChapterCrud.autosave";

/** Records every write in order, so tests can assert on sequence, not just the last value. */
function recordingPersist(
  onWrite?: (chapterId: string, payload: Record<string, unknown>) => void,
  failOn?: (chapterId: string, payload: Record<string, unknown>) => boolean
) {
  const writes: Array<{ chapterId: string; body: string }> = [];
  const persist: PersistChapter = async (chapterId, payload) => {
    const serialized = JSON.stringify(payload);
    writes.push({ chapterId, body: String(payload.body ?? serialized) });
    // Hook for simulating a keystroke that lands while this write is awaiting.
    onWrite?.(chapterId, payload);
    if (failOn?.(chapterId, payload)) return { ok: false, serialized };
    return { ok: true, serialized };
  };
  return { persist, writes };
}

describe("drainPendingSaves", () => {
  it("writes nothing when the queue is empty", async () => {
    const { persist, writes } = recordingPersist();
    const result = await drainPendingSaves(new Map(), persist);
    expect(writes).toEqual([]);
    expect(result.saved.size).toBe(0);
    expect(result.failedChapterId).toBeNull();
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
    expect(result.failedChapterId).toBeNull();
  });

  // THE REGRESSION TEST. Reproduces the exact sequence that overwrote newer
  // prose with older: content is queued for B while A is being written, then a
  // newer edit to B arrives while B is being written. The stale queued payload
  // must never land after the newer one.
  it("never writes an older payload after a newer one for the same chapter", async () => {
    const pending = new Map<string, Record<string, unknown>>([["a", { body: "a1" }]]);

    const { persist, writes } = recordingPersist((chapterId) => {
      // While A is in flight the author switches to B and types. Under the old
      // code this entry outlived A's drain.
      if (chapterId === "a") pending.set("b", { body: "b-OLD" });
      // While B is in flight the author types again in B. This is newer and is
      // the content that must survive.
      if (chapterId === "b" && !writes.some((w) => w.body === "b-NEW")) {
        pending.set("b", { body: "b-NEW" });
      }
    });

    await drainPendingSaves(pending, persist);

    const bWrites = writes.filter((w) => w.chapterId === "b").map((w) => w.body);
    expect(bWrites).toContain("b-NEW");
    // The whole point: nothing older may be written after the newer content.
    expect(bWrites[bWrites.length - 1]).toBe("b-NEW");
    expect(pending.size).toBe(0);
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

  it("re-queues the payload when a write fails, so the content is not lost", async () => {
    const pending = new Map<string, Record<string, unknown>>([["a", { body: "unsaved" }]]);
    const { persist } = recordingPersist(undefined, (id) => id === "a");

    const result = await drainPendingSaves(pending, persist);

    expect(result.failedChapterId).toBe("a");
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
      (id) => id === "a"
    );

    const result = await drainPendingSaves(pending, persist);

    expect(result.failedChapterId).toBe("a");
    // The re-queue must not clobber the newer content with the payload that
    // just failed.
    expect(pending.get("a")).toEqual({ body: "newer" });
  });

  it("stops at the first failure and leaves the rest queued for a later drain", async () => {
    const pending = new Map<string, Record<string, unknown>>([
      ["a", { body: "a1" }],
      ["b", { body: "b1" }],
      ["c", { body: "c1" }],
    ]);
    const { persist, writes } = recordingPersist(undefined, (id) => id === "b");

    const result = await drainPendingSaves(pending, persist);

    expect(result.failedChapterId).toBe("b");
    expect(writes.map((w) => w.chapterId)).toEqual(["a", "b"]);
    // b re-queued, c never attempted — both still pending.
    expect([...pending.keys()].sort()).toEqual(["b", "c"]);
    expect(result.saved.get("a")).toBe(JSON.stringify({ body: "a1" }));
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
