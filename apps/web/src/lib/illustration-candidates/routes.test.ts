import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ auth: vi.fn(), factory: vi.fn(), list: vi.fn(), save: vi.fn(), image: vi.fn() }));
vi.mock("@/lib/auth/require-author", () => ({ requireAuthorRoleForApi: f.auth }));
vi.mock("./repository", () => ({ createCandidatePorts: f.factory }));
vi.mock("./service", async (original) => ({ ...await original<typeof import("./service")>(), CandidateService: class { list = f.list; save = f.save; image = f.image; } }));
import { candidateImage, listCandidates, saveCandidate } from "./routes";
const uuid = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id: uuid, editionId: uuid, chapterId: uuid, assetId: uuid }) };
const request = () => new Request("http://localhost/test");
beforeEach(() => { vi.resetAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); f.auth.mockResolvedValue({ user: { id: uuid }, response: null }); });
afterEach(() => vi.restoreAllMocks());
it.each([401, 403])("rejects %s before constructing privileged ports on every route", async (status) => {
  f.auth.mockResolvedValue({ user: null, response: new Response(null, { status }) });
  for (const route of [listCandidates, saveCandidate, candidateImage]) expect((await route(request(), context)).status).toBe(status);
  expect(f.factory).not.toHaveBeenCalled(); expect(f.image).not.toHaveBeenCalled();
});
it("rejects malformed scope before constructing ports", async () => {
  expect((await listCandidates(request(), { params: Promise.resolve({ id: "x", editionId: uuid, chapterId: uuid }) })).status).toBe(404);
  expect(f.factory).not.toHaveBeenCalled();
});
it("returns private, non-cacheable image bytes, never a URL", async () => {
  f.image.mockResolvedValue({ bytes: Buffer.from("png"), mime: "image/png" });
  const response = await candidateImage(request(), context);
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-type")).toBe("image/png"); expect(await response.text()).toBe("png");
});
it("does not disclose raw storage errors", async () => {
  f.image.mockRejectedValue(new Error("secret provider path token"));
  const response = await candidateImage(request(), context);
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret");
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
});
