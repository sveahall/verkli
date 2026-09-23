import { afterEach, expect, it, vi } from "vitest";
import { createCandidateAdapter } from "./api-adapter";
import { candidateBaseUrl } from "./contracts";
const id = "00000000-0000-4000-8000-000000000001";
const scope = { bookId: id, editionId: id, chapterId: id };
const intent = { requestId: id, expectedChapterVersion: 4, alt: "Boat", placement: "icon" as const, styleSnapshot: { name: "Sea", medium: "Ink", palette: "Blue" } };
const candidate = { id, version: 1, createdAt: "2026-09-22T12:00:00Z", alt: "Boat", placement: "icon", styleSnapshot: intent.styleSnapshot, width: 8, height: 6, sourceChapterVersion: 4, imageUrl: `${candidateBaseUrl(scope)}/${id}/image` };
afterEach(() => vi.unstubAllGlobals());
it("uses authenticated requests and preserves retry identity", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json(candidate)); vi.stubGlobal("fetch", fetcher);
  const adapter = createCandidateAdapter("owner", scope); const file = new File(["png"], "boat.png", { type: "image/png" });
  await expect(adapter.save(intent, file)).rejects.toThrow("Your local proposal is still here");
  await expect(adapter.save(intent, file)).resolves.toMatchObject({ id });
  for (const call of fetcher.mock.calls) { const options = call[1]; expect(options.credentials).toBe("same-origin"); expect(options.cache).toBe("no-store"); expect(JSON.parse(options.body.get("intent")).requestId).toBe(id); }
});
it.each(["https://example.com/private.png", "/api/books/other/image"])("rejects returned image locator %s", async (imageUrl) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ scope: { ...scope, chapterVersion: 4, chapterTitle: "Sea" }, candidates: [{ ...candidate, imageUrl }] })));
  await expect(createCandidateAdapter("owner", scope).list()).rejects.toThrow("did not match");
});
it("rejects late responses for a different chapter", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ scope: { ...scope, chapterId: "00000000-0000-4000-8000-000000000002", chapterVersion: 4, chapterTitle: "Other" }, candidates: [] })));
  await expect(createCandidateAdapter("owner", scope).list()).rejects.toThrow("did not match");
});
