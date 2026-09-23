import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheOfflineUrls, clearAllOfflineContentUrls, retireOfflineServiceWorker } from "./service-worker";

const { clearOfflineDatabase } = vi.hoisted(() => ({ clearOfflineDatabase: vi.fn() }));
vi.mock("./idb", () => ({ clearOfflineDatabase }));
const removeCache = vi.fn();
const unregister = vi.fn();
const reload = vi.fn();
const register = vi.fn();
const update = vi.fn();
const oldPostMessage = vi.fn();
const events: string[] = [];
let acknowledge: unknown;
let tabs: string[];

type Port = { peer?: Port; onmessage?: (event: { data: unknown }) => void; close: () => void };
class TestMessageChannel {
  port1: Port = { close: vi.fn() };
  port2: Port = { close: vi.fn() };
  constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1; }
}
function lifecycle() {
  const target = new EventTarget();
  return { addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target), dispatchEvent: target.dispatchEvent.bind(target) };
}
function retiredWorker() {
  return {
    ...lifecycle(), scriptURL: "https://reader.test/sw.js", state: "activated",
    postMessage: vi.fn((_message, ports: Port[]) => {
      events.push("claim-all-tabs");
      tabs = tabs.map(() => "retired");
      queueMicrotask(() => ports[0].peer?.onmessage?.({ data: acknowledge }));
    }),
  };
}
let registration: ReturnType<typeof lifecycle> & {
  scope: string; active: ReturnType<typeof retiredWorker>; installing: ReturnType<typeof retiredWorker> | null;
  waiting: null; unregister: typeof unregister; update: typeof update;
};

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); events.length = 0;
  tabs = ["old", "old"];
  acknowledge = { ok: true, version: "v3-retired" };
  removeCache.mockImplementation(async () => { events.push("purge"); return true; });
  unregister.mockImplementation(async () => { events.push("unregister"); return true; });
  update.mockResolvedValue(undefined);
  clearOfflineDatabase.mockResolvedValue(undefined);
  registration = { ...lifecycle(), scope: "https://reader.test/", active: retiredWorker(), installing: null, waiting: null, unregister, update };
  register.mockResolvedValue(registration);
  vi.stubGlobal("MessageChannel", TestMessageChannel);
  vi.stubGlobal("window", { location: { origin: "https://reader.test", reload } });
  vi.stubGlobal("caches", { keys: async () => ["verkli-content-v1", "verkli-static-v1", "unrelated-app"], delete: removeCache });
  vi.stubGlobal("navigator", { serviceWorker: {
    controller: { scriptURL: "https://reader.test/sw.js", postMessage: oldPostMessage },
    register,
    getRegistrations: async () => [registration],
  } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("offline saving is closed until ownership and entitlement leases exist", () => {
  it("rejects saving without contacting an old worker even if it would acknowledge success", async () => {
    await expect(cacheOfflineUrls(["/reader/read/paid-chapter"])).rejects.toThrow(/unavailable/i);
    expect(oldPostMessage).not.toHaveBeenCalled();
  });

  it("purges both legacy HTML caches but leaves unrelated applications alone", async () => {
    await clearAllOfflineContentUrls();
    expect(removeCache.mock.calls).toEqual([["verkli-content-v1"], ["verkli-static-v1"]]);
  });

  it("requires a verified takeover of both tabs before unregistering or purging", async () => {
    await retireOfflineServiceWorker();
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "https://reader.test/", updateViaCache: "none" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["claim-all-tabs", "unregister", "purge", "purge"]);
    expect(tabs).toEqual(["retired", "retired"]);
    expect(clearOfflineDatabase).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("waits for the replacement to activate while an old worker is still active", async () => {
    const replacement = retiredWorker(); replacement.state = "installing";
    registration.active = { ...retiredWorker(), postMessage: oldPostMessage };
    registration.installing = replacement;
    const retirement = retireOfflineServiceWorker();
    await vi.advanceTimersByTimeAsync(1);
    expect(unregister).not.toHaveBeenCalled();
    expect(removeCache).not.toHaveBeenCalled();
    registration.active = replacement; registration.installing = null;
    replacement.state = "activated"; replacement.dispatchEvent(new Event("statechange"));
    await retirement;
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(tabs).toEqual(["retired", "retired"]);
  });

  it.each([{ ok: true }, { ok: true, version: "v2-retired" }, { ok: false, version: "v3-retired" }])("never unregisters based on an unverified acknowledgement %j", async (reply) => {
    acknowledge = reply;
    const result = expect(retireOfflineServiceWorker()).rejects.toThrow(/replace the old offline worker/);
    await vi.advanceTimersByTimeAsync(15_001);
    await result;
    expect(unregister).not.toHaveBeenCalled();
    expect(removeCache).not.toHaveBeenCalled();
    expect(clearOfflineDatabase).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("re-registers the retirement worker for tabs stranded by the previous unregister-first cleanup", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { controller: { scriptURL: "https://reader.test/sw.js" }, register, getRegistrations: async () => [] } });
    await retireOfflineServiceWorker();
    expect(register).toHaveBeenCalledTimes(1);
    expect(events.indexOf("claim-all-tabs")).toBeLessThan(events.indexOf("unregister"));
  });

  it("does not install or unregister unrelated workers on a fresh page", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { controller: null, register, getRegistrations: async () => [{ scope: "https://reader.test/", active: { scriptURL: "https://reader.test/other/sw.js" }, unregister }] } });
    await retireOfflineServiceWorker();
    expect(register).not.toHaveBeenCalled(); expect(unregister).not.toHaveBeenCalled();
    expect(clearOfflineDatabase).toHaveBeenCalledTimes(1); expect(reload).not.toHaveBeenCalled();
  });

  it("does not replace an unrelated registration to rescue a stranded old controller", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { controller: { scriptURL: "https://reader.test/sw.js" }, register, getRegistrations: async () => [{ scope: "https://reader.test/", active: { scriptURL: "https://reader.test/other/sw.js" }, unregister }] } });
    await expect(retireOfflineServiceWorker()).rejects.toThrow(/Another worker/);
    expect(register).not.toHaveBeenCalled(); expect(unregister).not.toHaveBeenCalled();
  });

  it("keeps the registration update path available when the network update fails", async () => {
    update.mockRejectedValue(new Error("Network unavailable"));
    await expect(retireOfflineServiceWorker()).rejects.toThrow("Network unavailable");
    expect(unregister).not.toHaveBeenCalled(); expect(reload).not.toHaveBeenCalled();
    expect(clearOfflineDatabase).not.toHaveBeenCalled();
  });

  it("detaches the cache-free controller even when another tab blocks database cleanup", async () => {
    clearOfflineDatabase.mockRejectedValue(new Error("Close other tabs"));
    await expect(retireOfflineServiceWorker()).rejects.toThrow("Close other tabs");
    expect(tabs).toEqual(["retired", "retired"]);
    expect(unregister).toHaveBeenCalledTimes(1); expect(reload).toHaveBeenCalledTimes(1);
  });
});
