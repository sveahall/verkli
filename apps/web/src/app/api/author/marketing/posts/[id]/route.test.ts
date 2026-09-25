import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
const m = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
const id = "11111111-1111-4111-8111-111111111111";
let post: Record<string, unknown> | null;
let readError = false;
let concurrentUpdate = false;
const revisionA = "2026-09-16T10:00:00.123456+00:00";
const revisionB = "2026-09-16T10:00:01.123456+00:00";
const patch = (body: object) => PATCH(new Request("http://localhost/post", { method: "PATCH", body: JSON.stringify({ expectedUpdatedAt: revisionA, ...body }) }), { params: Promise.resolve({ id }) });
beforeEach(() => {
 vi.clearAllMocks(); readError = false; concurrentUpdate = false;
 post = { id, status: "draft", content_type: "text", caption: "Reviewed caption", hashtags: "#book", media_asset_url: null, updated_at: revisionA };
 m.from.mockImplementation(() => {
  let update: object | undefined;
  const filters: Record<string, unknown> = {};
  const result = () => {
    if (readError) return { data: null, error: { message: "database unavailable" } };
    if (update && post && filters.updated_at !== post.updated_at) return { data: null, error: null };
    return { data: update ? { ...post, ...update, updated_at: revisionB } : post, error: null };
  };
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => { filters[key] = value; return q; },
    update: (v: object) => {
      update = v; m.update(v);
      if (concurrentUpdate) post = { ...post, updated_at: revisionB, caption: "Other tab" };
      return q;
    },
    maybeSingle: async () => result(), single: async () => result(),
  };
  return q;
 });
});
describe("campaign post review", () => {
 it.each(["scheduled", "processing", "uncertain"])("locks %s delivery against edits and manual status changes", async state => {
   post!.status = "ready"; post!.metadata = { delivery: { state } };
   expect((await patch({ caption: "Changed" })).status).toBe(409);
   expect(m.update).not.toHaveBeenCalled();
 });
 it("approves reviewed text", async () => { expect((await patch({ status: "ready" })).status).toBe(200); expect(m.update).toHaveBeenCalledWith({ status: "ready" }); });
 it("invalidates previous approval when copy changes", async () => { post!.status = "ready"; await patch({ caption: "Changed" }); expect(m.update).toHaveBeenCalledWith({ caption: "Changed", status: "draft" }); });
 it("cannot approve missing trailer media", async () => { post!.content_type = "trailer"; expect((await patch({ status: "ready" })).status).toBe(422); expect(m.update).not.toHaveBeenCalled(); });
 it("does not allow clients to invent worker asset states", async () => { expect((await patch({ status: "asset_pending" })).status).toBe(400); expect(m.update).not.toHaveBeenCalled(); });
 it("does not report missing or inaccessible posts as saved", async () => { post = null; expect((await patch({ caption: "Changed" })).status).toBe(404); expect(m.update).not.toHaveBeenCalled(); });
 it("does not treat a failed read as missing content", async () => { readError = true; expect((await patch({ caption: "Changed" })).status).toBe(500); expect(m.update).not.toHaveBeenCalled(); });
 it("requires review before manually marking a post published", async () => { expect((await patch({ status: "posted" })).status).toBe(409); expect(m.update).not.toHaveBeenCalled(); });
 it.each([
   { status: "posted" },
   { status: "ready", caption: "Stale caption A", hashtags: "#old" },
 ])("rejects a stale displayed revision before changing another tab's text or status: %j", async body => {
   post = { ...post, status: "ready", caption: "New approved caption B", updated_at: revisionB };
   const response = await patch(body);
   expect(response.status).toBe(409);
   expect((await response.json()).error).toBe("POST_CHANGED");
   expect(m.update).not.toHaveBeenCalled();
   expect(post.caption).toBe("New approved caption B");
 });
 it("atomically rejects a revision changed between read and update", async () => {
   concurrentUpdate = true;
   const response = await patch({ caption: "My change" });
   expect(response.status).toBe(409);
   expect((await response.json()).error).toBe("POST_CHANGED");
   expect(post?.caption).toBe("Other tab");
 });
 it("requires the revision seen by the client", async () => {
   expect((await patch({ status: "ready", expectedUpdatedAt: undefined })).status).toBe(400);
   expect(m.from).not.toHaveBeenCalled();
 });
 it("returns the next revision after a successful update", async () => {
   const response = await patch({ status: "ready" });
   expect(response.status).toBe(200);
   expect((await response.json()).post.updatedAt).toBe(revisionB);
 });

});

it("requires fresh audio when the narrated script changes", async () => {
  post = { ...post, content_type: "podcast", media_asset_url: "/private/audio", metadata: { audioScript: "Reviewed caption" } };
  expect((await patch({ caption: "Different script", status: "ready" })).status).toBe(422);
  expect(m.update).not.toHaveBeenCalled();
  expect((await patch({ caption: "Different script" })).status).toBe(200);
  expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ media_asset_url: null, status: "draft" }));
});
