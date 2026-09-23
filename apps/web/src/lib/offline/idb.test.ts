import { afterEach, describe, expect, it, vi } from "vitest";
import { clearOfflineDatabase, getOfflineChapter, getOfflineManifestForBook, hasOfflineBook } from "./idb";
afterEach(() => vi.unstubAllGlobals());
describe("retired offline data", () => {
  it("never opens IndexedDB to render old chapter text or report a saved copy", async () => {
    const open = vi.fn(); vi.stubGlobal("window", {}); vi.stubGlobal("indexedDB", { open });
    expect(await getOfflineChapter("reader", "chapter")).toBeNull();
    expect(await getOfflineManifestForBook("reader", "book")).toBeNull();
    expect(await hasOfflineBook("reader", "book")).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
  it("deletes the whole legacy database, including other previously signed-in users", async () => {
    const request: { onsuccess?: () => void } = {};
    const deleteDatabase = vi.fn(() => { queueMicrotask(() => request.onsuccess?.()); return request; });
    vi.stubGlobal("indexedDB", { deleteDatabase });
    await clearOfflineDatabase(); expect(deleteDatabase).toHaveBeenCalledWith("verkli-offline");
  });
  it("does not claim deletion succeeded when another tab keeps the database open", async () => {
    const request: { onblocked?: () => void } = {};
    vi.stubGlobal("indexedDB", { deleteDatabase: () => { queueMicrotask(() => request.onblocked?.()); return request; } });
    await expect(clearOfflineDatabase()).rejects.toThrow(/close other/i);
  });
});
