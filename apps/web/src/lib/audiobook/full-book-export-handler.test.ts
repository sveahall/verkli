import { describe, expect, it, vi } from "vitest";
import { createFullBookExportHandlers, type FullBookExportRuntime } from "./full-book-export-handler";
import { createPrivateExportFixture, PRIVATE_FIXTURE_BOOK, PRIVATE_FIXTURE_EDITION } from "./private-export-fixture";
import { FULL_BOOK_EXPORT_SOURCE_LIMITS } from "./full-book-export-contract";
import { privateSnapshotId, PrivateExportError, type PrivateExportSnapshot } from "./private-export-contract";
import type { ExportJobRecord } from "./full-book-export-jobs";
const ownerId = "00000000-0000-4000-8000-000000000001", requestId = "00000000-0000-4000-8000-000000000009";
const context = { params: Promise.resolve({ id: PRIVATE_FIXTURE_BOOK }) }, url = `http://localhost/export?editionId=${PRIVATE_FIXTURE_EDITION}`;
async function fixture() {
  const source = await createPrivateExportFixture("complete").snapshot(ownerId, PRIVATE_FIXTURE_BOOK, PRIVATE_FIXTURE_EDITION, new AbortController().signal) as PrivateExportSnapshot;
  let saved: ExportJobRecord | null = null;
  const runtime: FullBookExportRuntime = {
    authorize: vi.fn(async () => ownerId), assertEdition: vi.fn(async () => undefined), snapshot: vi.fn(async () => source), capacity: vi.fn(async () => 1024 * 1024),
    store: { read: vi.fn(async () => saved), insert: vi.fn(async (record) => saved ??= record), compareAndSwap: vi.fn(async (record, patch) => { if (saved?.status !== record.status) return null; saved = { ...record, ...patch }; return saved; }) },
    list: vi.fn(async () => saved ? [saved] : []), enqueue: vi.fn(async () => undefined), download: vi.fn(async () => new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); } })),
  };
  const input = { editionId: PRIVATE_FIXTURE_EDITION, requestId, snapshotId: privateSnapshotId(source, FULL_BOOK_EXPORT_SOURCE_LIMITS), format: "m4b" };
  return { runtime, source, input, handlers: createFullBookExportHandlers(runtime), get saved() { return saved!; }, set saved(value) { saved = value; } };
}
describe("full book HTTP ownership and publication", () => {
  it("stops awaiting stalled author authorization on request cancellation", async () => {
    const f = await fixture(), controller = new AbortController();
    vi.mocked(f.runtime.authorize).mockImplementation(() => new Promise(() => undefined));
    const pending = f.handlers.GET(new Request(url, { signal: controller.signal }), context);
    controller.abort(); expect((await pending).status).toBe(504); expect(f.runtime.snapshot).not.toHaveBeenCalled();
  });
  it.each(["request abort", "deadline with late success", "deadline with late failure"])("bounds enqueue on %s and retries the same saved identity", async (scenario) => {
    const f = await fixture(), controller = new AbortController();
    let started!: () => void, succeed!: () => void, fail!: (cause: Error) => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const queue = new Promise<void>((resolve, reject) => { succeed = resolve; fail = reject; });
    vi.mocked(f.runtime.enqueue).mockImplementation(async () => { started(); return queue; });
    const timeout = scenario === "request abort" ? null : vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    try {
      const pending = f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input), ...(scenario === "request abort" ? { signal: controller.signal } : {}) }), context);
      await entered; controller.abort();
      const response = await Promise.race([pending, new Promise<null>((resolve) => setTimeout(() => resolve(null), 50))]);
      expect(response).not.toBeNull(); expect(response!.status).toBe(504); expect((await response!.json()).message).toContain("saved export");
      const id = f.saved.id; expect(f.saved.status).toBe("pending");
      if (scenario === "deadline with late failure") fail(new Error("Queue outcome arrived late")); else succeed();
      await Promise.resolve(); timeout?.mockRestore();
      vi.mocked(f.runtime.enqueue).mockResolvedValue(undefined);
      const retried = await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
      expect(retried.status).toBe(202); expect((await retried.json()).id).toBe(id); expect(f.saved.status).toBe("pending");
      expect(vi.mocked(f.runtime.enqueue).mock.calls.map(([record]) => record.id)).toEqual([id, id]);
    } finally { succeed(); timeout?.mockRestore(); }
  });
  it("enqueues only strict current identities and returns no object paths", async () => {
    const f = await fixture(), response = await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
    expect(response.status).toBe(202); const result = await response.json(); expect(result.status).toBe("pending"); expect(result).not.toHaveProperty("artifact"); expect(f.runtime.enqueue).toHaveBeenCalledOnce();
  });
  it("rejects client supplied owner or path fields before enqueue", async () => {
    const f = await fixture(), response = await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify({ ...f.input, ownerId, path: "private/file" }) }), context);
    expect(response.status).toBe(400); expect(f.runtime.enqueue).not.toHaveBeenCalled();
  });
  it("refuses a stale source before creating any job", async () => {
    const f = await fixture(); f.source.book.title = "Changed";
    expect((await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context)).status).toBe(409); expect(f.runtime.store.insert).not.toHaveBeenCalled();
  });
  it("denies downloads after source drift and for another owner", async () => {
    const f = await fixture(); await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
    f.saved = { ...f.saved, status: "completed", artifact: { path: "server-only", byteLength: 3, sha256: "a".repeat(64), durationSeconds: 5, chapterCount: 2 } };
    f.source.book.title = "Changed";
    expect((await f.handlers.GET(new Request(`${url}&jobId=${f.saved.id}&download=1`), context)).status).toBe(404); expect(f.runtime.download).not.toHaveBeenCalled();
    f.saved = { ...f.saved, ownerId: requestId };
    expect((await f.handlers.GET(new Request(`${url}&jobId=${f.saved.id}&download=1`), context)).status).toBe(404);
  });
  it("confirms cancellation only when its CAS wins", async () => {
    const f = await fixture(); await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
    vi.mocked(f.runtime.store.compareAndSwap).mockResolvedValueOnce(null);
    expect((await f.handlers.DELETE(new Request(`${url}&jobId=${f.saved.id}`, { method: "DELETE" }), context)).status).toBe(409);
    expect((await f.handlers.DELETE(new Request(`${url}&jobId=${f.saved.id}`, { method: "DELETE" }), context)).status).toBe(200); expect(f.saved.status).toBe("cancelled");
  });
  it("allows cancelling a saved job after source audio becomes unavailable", async () => {
    const f = await fixture(); await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
    vi.mocked(f.runtime.snapshot).mockRejectedValue(new PrivateExportError(422, "SOURCE_UNVERIFIED", "The edited chapter has no matching audio."));
    expect((await f.handlers.DELETE(new Request(`${url}&jobId=${f.saved.id}`, { method: "DELETE" }), context)).status).toBe(200);
    expect(f.saved.status).toBe("cancelled");
  });
  it("returns saved jobs with a source error instead of hiding them after edits", async () => {
    const f = await fixture(); await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
    vi.mocked(f.runtime.snapshot).mockRejectedValue(new PrivateExportError(422, "SOURCE_UNVERIFIED", "The edited chapter has no matching audio."));
    const response = await f.handlers.GET(new Request(url), context), body = await response.json();
    expect(response.status).toBe(200); expect(body.snapshotId).toBeNull(); expect(body.sourceError).toContain("edited chapter"); expect(body.jobs[0].status).toBe("pending");
  });
  it("cancels an acquired download stream if the request aborts before publication", async () => {
    const f = await fixture(); await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
    f.saved = { ...f.saved, status: "completed", artifact: { path: "server-only", byteLength: 3, sha256: "a".repeat(64), durationSeconds: 5, chapterCount: 2 } };
    const controller = new AbortController(), cancel = vi.fn();
    vi.mocked(f.runtime.download).mockImplementation(async () => { controller.abort(); return new ReadableStream<Uint8Array>({ cancel }); });
    const response = await f.handlers.GET(new Request(`${url}&jobId=${f.saved.id}&download=1`, { signal: controller.signal }), context);
    expect(response.status).toBe(504); expect(cancel).toHaveBeenCalledOnce();
  });
  it("streams a completed file with private attachment headers", async () => {
    const f = await fixture(); await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
    f.saved = { ...f.saved, status: "completed", artifact: { path: "server-only", byteLength: 3, sha256: "a".repeat(64), durationSeconds: 5, chapterCount: 2 } };
    const response = await f.handlers.GET(new Request(`${url}&jobId=${f.saved.id}&download=1`), context);
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(response.headers.get("Content-Type")).toBe("audio/mp4"); expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("multipart HTTP contract", () => {
  it("reports total export capacity independently of the current bucket part cap", async () => {
    const f = await fixture(), result = await (await f.handlers.GET(new Request(url), context)).json();
    expect(result.maxOutputBytes).toBe(4 * 1024 ** 3); expect(result.maxPartBytes).toBe(1024 ** 2); expect(JSON.stringify(result)).not.toContain("exports/");
    vi.mocked(f.runtime.capacity).mockResolvedValue(1024);
    const tiny = await (await f.handlers.GET(new Request(url), context)).json(); expect(tiny.maxOutputBytes).toBe(1024 * 4096); expect(tiny.maxPartBytes).toBe(1024);
    vi.mocked(f.runtime.capacity).mockResolvedValue(1024 ** 2);
    f.runtime.singleFileFixture = true; const legacy = await (await createFullBookExportHandlers(f.runtime).GET(new Request(url), context)).json();
    expect(legacy.maxOutputBytes).toBe(1024 ** 2); expect(legacy.maxPartBytes).toBeNull();
  });
  it("returns Range 416 with the real size without opening private storage", async () => {
    const f = await fixture(); await f.handlers.POST(new Request(url, { method: "POST", body: JSON.stringify(f.input) }), context);
    f.saved = { ...f.saved, status: "completed", artifact: { path: "server-only", byteLength: 12345, sha256: "a".repeat(64), durationSeconds: 5, chapterCount: 2 } };
    for (const range of ["bytes=0-1", "bytes=999999-", "malformed"]) {
      const response = await f.handlers.GET(new Request(`${url}&jobId=${f.saved.id}&download=1`, { headers: { Range: range } }), context);
      expect(response.status).toBe(416); expect(response.headers.get("Content-Range")).toBe("bytes */12345"); expect(response.headers.get("Accept-Ranges")).toBe("none"); expect(await response.text()).toBe("");
    }
    expect(f.runtime.download).not.toHaveBeenCalled();
  });
});
