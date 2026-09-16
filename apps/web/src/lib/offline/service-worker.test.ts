import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheOfflineUrls, clearOfflineUrls } from "./service-worker";

const postMessage = vi.fn();
const close = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { location: { origin: "https://reader.test" }, setTimeout, clearTimeout });
  vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ active: { postMessage } }) } });
  vi.stubGlobal("MessageChannel", class {
    port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close };
    port2 = { reply: (data: unknown) => this.port1.onmessage?.({ data }), close };
  });
  postMessage.mockReset();
  close.mockClear();
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("offline worker acknowledgement", () => {
  it("rejects failed cache writes instead of reporting a saved book", async () => {
    postMessage.mockImplementation((_command, [port]) => port.reply({ ok: false }));
    await expect(cacheOfflineUrls(["/reader/read/chapter"])).rejects.toThrow(/offline/i);
  });

  it("rejects unsupported browsers", async () => {
    vi.stubGlobal("navigator", {});
    await expect(cacheOfflineUrls(["/reader/read/chapter"])).rejects.toThrow(/not supported/i);
  });

  it("bounds waiting for registration so Save cannot hang forever", async () => {
    vi.stubGlobal("navigator", { serviceWorker: { ready: new Promise(() => {}) } });
    const result = expect(cacheOfflineUrls(["/reader/read/chapter"])).rejects.toThrow(/try again/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
  });

  it("rejects a missing acknowledgement and releases ports", async () => {
    const result = expect(cacheOfflineUrls(["/reader/read/chapter"])).rejects.toThrow(/try again/i);
    await vi.advanceTimersByTimeAsync(60_000);
    await result;
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("accepts confirmed writes and deduplicates chapter URLs", async () => {
    postMessage.mockImplementation((_command, [port]) => port.reply({ ok: true }));
    await cacheOfflineUrls(["/reader/read/chapter", " /reader/read/chapter "]);
    expect(postMessage.mock.calls[0][0]).toEqual({ type: "OFFLINE_CACHE_URLS", urls: ["https://reader.test/reader/read/chapter"] });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("reports a failed removal so the UI cannot claim content was cleared", async () => {
    postMessage.mockImplementation((_command, [port]) => port.reply({ ok: false }));
    await expect(clearOfflineUrls(["/reader/read/chapter"])).rejects.toThrow(/offline/i);
  });
});
