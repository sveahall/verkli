import { afterEach, expect, it, vi } from "vitest";
import { adDraftsClient } from "./ad-drafts-client";
afterEach(() => vi.unstubAllGlobals());
it("does not turn a failed read into an empty draft list", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"AD_DRAFT_STORAGE_FAILED"}', { status: 500 })));
  await expect(adDraftsClient.list()).rejects.toThrow(/could not be confirmed/i);
});
it("never retries an uncertain save automatically", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("Network unavailable")); vi.stubGlobal("fetch", fetchMock);
  await expect(adDraftsClient.save("book", {} as never, null)).rejects.toThrow(/could not be confirmed/i);
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("returns a visible conflict for a stale draft revision", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"AD_DRAFT_CHANGED"}', { status: 409 })));
  await expect(adDraftsClient.save("book", {} as never, { id: "draft", updatedAt: "old" } as never)).rejects.toThrow(/changed elsewhere/);
});
