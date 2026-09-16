import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";
const m = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/require-author-marketing", () => ({ requireAuthorAndMarketingEnabled: async () => ({ user: { id: "author" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: m.from }) }));
const id = "11111111-1111-4111-8111-111111111111";
let post: Record<string, unknown> | null;
let readError = false;
const patch = (body: object) => PATCH(new Request("http://localhost/post", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
beforeEach(() => {
 vi.clearAllMocks(); readError = false;
 post = { id, status: "draft", content_type: "text", caption: "Reviewed caption", hashtags: "#book", media_asset_url: null };
 m.from.mockImplementation(() => {
  let update: object | undefined;
  const result = () => ({ data: update ? { ...post, ...update } : post, error: readError ? { message: "database unavailable" } : null });
  const q = { select: () => q, eq: () => q, update: (v: object) => { update = v; m.update(v); return q; }, maybeSingle: async () => result(), single: async () => result() };
  return q;
 });
});
describe("campaign post review", () => {
 it("approves reviewed text", async () => { expect((await patch({ status: "ready" })).status).toBe(200); expect(m.update).toHaveBeenCalledWith({ status: "ready" }); });
 it("invalidates previous approval when copy changes", async () => { post!.status = "ready"; await patch({ caption: "Changed" }); expect(m.update).toHaveBeenCalledWith({ caption: "Changed", status: "draft" }); });
 it("cannot approve missing trailer media", async () => { post!.content_type = "trailer"; expect((await patch({ status: "ready" })).status).toBe(422); expect(m.update).not.toHaveBeenCalled(); });
 it("does not allow clients to invent worker asset states", async () => { expect((await patch({ status: "asset_pending" })).status).toBe(400); expect(m.update).not.toHaveBeenCalled(); });
 it("does not report missing or inaccessible posts as saved", async () => { post = null; expect((await patch({ caption: "Changed" })).status).toBe(404); expect(m.update).not.toHaveBeenCalled(); });
 it("does not treat a failed read as missing content", async () => { readError = true; expect((await patch({ caption: "Changed" })).status).toBe(500); expect(m.update).not.toHaveBeenCalled(); });
 it("requires review before manually marking a post published", async () => { expect((await patch({ status: "posted" })).status).toBe(409); expect(m.update).not.toHaveBeenCalled(); });
});
