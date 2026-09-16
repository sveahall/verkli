import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
function worker() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const remove = vi.fn().mockResolvedValue(true);
  const open = vi.fn();
  const fetch = vi.fn();
  const claim = vi.fn();
  runInNewContext(source, {
    self: { addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; }, location: { origin: "https://reader.test" }, skipWaiting: vi.fn(), clients: { claim } },
    caches: { keys: async () => ["verkli-static-v1", "verkli-content-v1", "another-app"], delete: remove, open }, fetch, Request, URL,
  });
  const dispatch = async (name: string, details: Record<string, unknown> = {}) => {
    let work: Promise<void> | undefined;
    listeners[name]?.({ ...details, waitUntil: (promise: Promise<void>) => { work = promise; } });
    await work;
  };
  return { dispatch, open, fetch, remove, claim };
}

describe("retired offline worker", () => {
  it("claims existing tabs before purging old HTML caches on activation", async () => {
    const w = worker(); await w.dispatch("activate");
    expect(w.remove.mock.calls).toEqual([["verkli-static-v1"], ["verkli-content-v1"]]);
    expect(w.claim).toHaveBeenCalledTimes(1);
    expect(w.claim.mock.invocationCallOrder[0]).toBeLessThan(w.remove.mock.invocationCallOrder[0]);
    expect(w.open).not.toHaveBeenCalled();
  });
  it("acknowledges retirement only after claiming all tabs and purging caches", async () => {
    const w = worker(); const reply = vi.fn();
    await w.dispatch("message", { data: { type: "OFFLINE_RETIRE" }, ports: [{ postMessage: reply }] });
    expect(reply).toHaveBeenCalledWith({ ok: true, version: "v3-retired" });
    expect(w.claim.mock.invocationCallOrder[0]).toBeLessThan(w.remove.mock.invocationCallOrder[0]);
    expect(w.remove.mock.invocationCallOrder.at(-1)).toBeLessThan(reply.mock.invocationCallOrder[0]);
  });
  it("waits for asynchronous client takeover before purging or acknowledging", async () => {
    const w = worker(); const reply = vi.fn();
    let finishClaim!: () => void;
    w.claim.mockReturnValue(new Promise<void>((resolve) => { finishClaim = resolve; }));
    const retirement = w.dispatch("message", { data: { type: "OFFLINE_RETIRE" }, ports: [{ postMessage: reply }] });
    await Promise.resolve();
    expect(w.remove).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
    finishClaim(); await retirement;
    expect(reply).toHaveBeenCalledWith({ ok: true, version: "v3-retired" });
  });
  it("refuses a retirement acknowledgement if taking over other tabs fails", async () => {
    const w = worker(); const reply = vi.fn();
    w.claim.mockRejectedValue(new Error("claim failed"));
    await w.dispatch("message", { data: { type: "OFFLINE_RETIRE" }, ports: [{ postMessage: reply }] });
    expect(reply).toHaveBeenCalledWith({ ok: false });
    expect(w.remove).not.toHaveBeenCalled();
  });
  it("never precaches an authenticated app shell during installation", async () => {
    const w = worker(); await w.dispatch("install");
    expect(w.open).not.toHaveBeenCalled(); expect(w.fetch).not.toHaveBeenCalled();
  });
  it.each(["/reader", "/reader/read/paid-chapter", "/reader/books/book?_rsc=1", "/api/offline/books/book/manifest"])("never serves or stores %s from URL caches", async (path) => {
    const w = worker(); const respondWith = vi.fn();
    await w.dispatch("fetch", { request: new Request(`https://reader.test${path}`), respondWith });
    expect(respondWith).not.toHaveBeenCalled(); expect(w.open).not.toHaveBeenCalled();
  });
  it("rejects save commands from an older open tab", async () => {
    const w = worker(); const reply = vi.fn();
    await w.dispatch("message", { data: { type: "OFFLINE_CACHE_URLS", urls: ["https://reader.test/reader/read/paid-chapter"] }, ports: [{ postMessage: reply }] });
    expect(reply).toHaveBeenCalledWith({ ok: false }); expect(w.open).not.toHaveBeenCalled(); expect(w.fetch).not.toHaveBeenCalled();
  });
});
