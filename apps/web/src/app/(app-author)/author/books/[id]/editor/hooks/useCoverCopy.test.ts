import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverCopy } from "@/lib/cover-copy";

// Exercise the hook's real callbacks and cleanup with a controlled clock and DB.
// Rendering is covered separately; this harness does not simulate a browser.
const harness = vi.hoisted(() => ({ states: [] as string[], drafts: [] as Array<{ authorLine: string }>, cleanup: undefined as (() => void) | undefined, client: vi.fn(), toast: vi.fn() }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [typeof value === "function" ? value() : value, (next: unknown) => { if (typeof next === "string") harness.states.push(next); else if (next && typeof next === "object" && "authorLine" in next) harness.drafts.push(next as { authorLine: string }); }],
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useEffect: (effect: () => (() => void)) => { harness.cleanup = effect(); },
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: harness.client }));
vi.mock("@/components/ui/toast", () => ({ useToastHelpers: () => ({ error: harness.toast }) }));
import { useCoverCopy } from "./useCoverCopy";

type Result = { data: { id: string } | null; error: { message: string } | null };
const copy = (authorLine: string): CoverCopy => ({ authorLine, dustJacket: true, flapText: "Flap" });
let writes: Array<{ bookId: string; value: CoverCopy; finish: (result?: Result) => void }>;
let stored: CoverCopy | undefined;
const settle = async () => { await vi.advanceTimersByTimeAsync(0); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  harness.states.length = 0; harness.drafts.length = 0; harness.cleanup = undefined; harness.toast.mockReset();
  writes = []; stored = undefined;
  harness.client.mockReturnValue({ from: (table: string) => {
    expect(table).toBe("books");
    return { update: ({ cover_copy: value }: { cover_copy: CoverCopy }) => {
      let bookId = "";
      const result = () => new Promise<Result>((resolve) => {
        writes.push({ bookId, value, finish: (outcome = { data: { id: bookId }, error: null }) => {
          if (outcome.data && !outcome.error) stored = value;
          resolve(outcome);
        } });
      });
      const query = {
        eq: (key: string, id: string) => { expect(key).toBe("id"); bookId = id; return query; },
        select: () => query,
        maybeSingle: result,
        then: (resolve: (value: Result) => unknown) => result().then(resolve),
      };
      return query;
    } };
  } });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
// eslint-disable-next-line react-hooks/rules-of-hooks -- React hooks are explicitly mocked by this callback lifecycle harness.
const mount = (id = "book-a") => useCoverCopy({ book: { id, cover_copy: copy("Initial") } as Parameters<typeof useCoverCopy>[0]["book"] });

describe("cover-copy persistence", () => {
  it("does not block a different book behind a pending write", async () => {
    const first = mount("book-a");
    const second = mount("book-b");
    first.updateCoverCopy(copy("A"));
    second.updateCoverCopy(copy("B"));
    await vi.advanceTimersByTimeAsync(400);
    expect(writes.map((write) => write.bookId)).toEqual(["book-a", "book-b"]);
    writes[1].finish(); await settle();
    expect(stored?.authorLine).toBe("B");
    writes[0].finish(); await settle();
  });

  it("cleans up a denied write and allows a reopened editor to save", async () => {
    const removeQueue = vi.spyOn(Map.prototype, "delete");
    try {
      const first = mount();
      first.updateCoverCopy(copy("Denied")); await vi.advanceTimersByTimeAsync(400);
      writes[0].finish({ data: null, error: { message: "Permission denied" } }); await settle();
      expect(harness.states.at(-1)).toBe("error");
      expect(harness.toast).toHaveBeenCalledOnce();
      expect(removeQueue).toHaveBeenCalledWith("book-a");
      removeQueue.mockClear();
      const reopened = mount();
      reopened.updateCoverCopy(copy("Allowed")); await vi.advanceTimersByTimeAsync(400);
      expect(writes).toHaveLength(2);
      writes[1].finish(); await settle();
      expect(stored?.authorLine).toBe("Allowed");
      expect(removeQueue).toHaveBeenCalledWith("book-a");
    } finally {
      removeQueue.mockRestore();
    }
  });

  it("keeps a reopened editor behind the previous session's pending flush", async () => {
    const previous = mount();
    previous.updateCoverCopy(copy("A")); await vi.advanceTimersByTimeAsync(400);
    previous.updateCoverCopy(copy("B"));
    harness.cleanup?.();
    const reopened = mount();
    reopened.updateCoverCopy(copy("C")); await vi.advanceTimersByTimeAsync(400);
    expect(writes).toHaveLength(1);
    writes[0].finish(); await settle();
    expect(writes.map((write) => write.value.authorLine)).toEqual(["A", "B"]);
    writes[1].finish(); await settle();
    expect(writes.map((write) => write.value.authorLine)).toEqual(["A", "B", "C"]);
    writes[2].finish(); await settle();
    expect(stored?.authorLine).toBe("C");
  });

  it("keeps a typed space so the author can continue the next word", () => {
    const hook = mount();
    hook.updateCoverCopy(copy("Professor "));
    expect(harness.drafts.at(-1)?.authorLine).toBe("Professor ");
  });

  it("continues to B when an older A write fails", async () => {
    const hook = mount();
    hook.updateCoverCopy(copy("A")); await vi.advanceTimersByTimeAsync(400);
    hook.updateCoverCopy(copy("B")); await vi.advanceTimersByTimeAsync(400);
    writes[0].finish({ data: null, error: { message: "Temporarily unavailable" } }); await settle();
    expect(writes).toHaveLength(2);
    writes[1].finish(); await settle();
    expect(stored?.authorLine).toBe("B");
    expect(harness.states.at(-1)).toBe("saved");
  });

  it("flushes B on unmount when A finishes during B's debounce", async () => {
    const hook = mount();
    hook.updateCoverCopy(copy("A")); await vi.advanceTimersByTimeAsync(400);
    hook.updateCoverCopy(copy("B"));
    writes[0].finish(); await settle();
    harness.cleanup?.(); await settle();
    expect(writes.map((write) => write.value.authorLine)).toEqual(["A", "B"]);
    writes[1].finish(); await settle();
    expect(stored?.authorLine).toBe("B");
  });

  it("serializes writes so a slow older response cannot overwrite newer text", async () => {
    const hook = mount();
    hook.updateCoverCopy(copy("A")); await vi.advanceTimersByTimeAsync(400);
    hook.updateCoverCopy(copy("B")); await vi.advanceTimersByTimeAsync(400);
    expect(writes).toHaveLength(1);
    writes[0].finish(); await settle();
    expect(writes).toHaveLength(2);
    expect(harness.states.at(-1)).toBe("saving");
    writes[1].finish(); await settle();
    expect(stored?.authorLine).toBe("B");
    expect(harness.states.at(-1)).toBe("saved");
  });

  it("does not claim Saved when the database updated no visible row", async () => {
    const hook = mount();
    hook.updateCoverCopy(copy("A")); await vi.advanceTimersByTimeAsync(400);
    writes[0].finish({ data: null, error: null }); await settle();
    expect(harness.states.at(-1)).toBe("error");
    expect(harness.toast).toHaveBeenCalledOnce();
    expect(stored).toBeUndefined();
  });

  it("does not duplicate an in-flight write when unmount flushes", async () => {
    const hook = mount();
    hook.updateCoverCopy(copy("A")); await vi.advanceTimersByTimeAsync(400);
    harness.cleanup?.(); await settle();
    expect(writes).toHaveLength(1);
    writes[0].finish(); await settle();
    expect(stored?.authorLine).toBe("A");
  });
});
