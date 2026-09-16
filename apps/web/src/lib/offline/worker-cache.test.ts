import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

async function cacheCommand(response: Response | Error) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const put = vi.fn();
  const fetch = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);
  runInNewContext(source, {
    self: { addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; }, location: { origin: "https://reader.test" } },
    caches: { open: async () => ({ put }) }, fetch, Request, URL,
  });
  const reply = vi.fn();
  let work: Promise<void> | undefined;
  listeners.message({ data: { type: "OFFLINE_CACHE_URLS", urls: ["https://reader.test/reader/read/chapter"] }, ports: [{ postMessage: reply }], waitUntil: (promise: Promise<void>) => { work = promise; } });
  await work;
  return { reply, put };
}

describe("offline precache result", () => {
  it.each([new Error("network unavailable"), new Response("denied", { status: 403 })])("reports failures to the save button", async (response) => {
    const { reply, put } = await cacheCommand(response);
    expect(reply).toHaveBeenCalledWith({ ok: false });
    expect(put).not.toHaveBeenCalled();
  });

  it("does not save a sign-in redirect as a readable chapter", async () => {
    const response = new Response("Sign in");
    Object.defineProperty(response, "redirected", { value: true });
    const { reply, put } = await cacheCommand(response);
    expect(reply).toHaveBeenCalledWith({ ok: false });
    expect(put).not.toHaveBeenCalled();
  });

  it("confirms successful content storage", async () => {
    const { reply, put } = await cacheCommand(new Response("Chapter"));
    expect(put).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith({ ok: true });
  });
});
