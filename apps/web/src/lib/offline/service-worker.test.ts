import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheOfflineUrls, clearAllOfflineContentUrls, retireOfflineServiceWorker } from "./service-worker";

const { clearOfflineDatabase } = vi.hoisted(() => ({ clearOfflineDatabase: vi.fn() }));
vi.mock("./idb", () => ({ clearOfflineDatabase }));
const removeCache = vi.fn();
const unregister = vi.fn();
const reload = vi.fn();
const postMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  removeCache.mockResolvedValue(true);
  unregister.mockResolvedValue(true);
  clearOfflineDatabase.mockResolvedValue(undefined);
  vi.stubGlobal("window", { location: { origin: "https://reader.test", reload } });
  vi.stubGlobal("caches", { keys: async () => ["verkli-content-v1", "verkli-static-v1", "unrelated-app"], delete: removeCache });
  vi.stubGlobal("navigator", { serviceWorker: {
    ready: Promise.resolve({ active: { postMessage } }),
    controller: { scriptURL: "https://reader.test/sw.js" },
    getRegistrations: async () => [{ active: { scriptURL: "https://reader.test/sw.js" }, unregister }],
  } });
});
afterEach(() => vi.unstubAllGlobals());

describe("offline saving is closed until ownership and entitlement leases exist", () => {
  it("rejects saving without contacting an old worker even if it would acknowledge success", async () => {
    await expect(cacheOfflineUrls(["/reader/read/paid-chapter"])).rejects.toThrow(/unavailable/i);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("purges both legacy HTML caches but leaves unrelated applications alone", async () => {
    await clearAllOfflineContentUrls();
    expect(removeCache.mock.calls).toEqual([["verkli-content-v1"], ["verkli-static-v1"]]);
  });

  it("retires an existing controller and purges persisted text without relying on the feature flag", async () => {
    await retireOfflineServiceWorker();
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(clearOfflineDatabase).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload uncontrolled pages or unregister unrelated workers", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { controller: null, getRegistrations: async () => [{ active: { scriptURL: "https://reader.test/other/sw.js" }, unregister }] } });
    await retireOfflineServiceWorker();
    expect(unregister).not.toHaveBeenCalled();
    expect(clearOfflineDatabase).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("detaches the retired controller even when another tab blocks database cleanup", async () => {
    clearOfflineDatabase.mockRejectedValue(new Error("Close other tabs"));
    await expect(retireOfflineServiceWorker()).rejects.toThrow("Close other tabs");
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
