import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createNotification: vi.fn(), check: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/notifications/server", () => ({ createNotification: mocks.createNotification }));
vi.mock("@/lib/rate-limit", () => ({ createPerUserRateLimiter: () => ({ check: mocks.check }) }));
const { GET, POST, DELETE } = await import("./route");

const readerId = "00000000-0000-4000-8000-000000000001";
const authorId = "00000000-0000-4000-8000-000000000002";
function client(userId: string | null = readerId) {
  const filters: Array<[string, string, unknown]> = [];
  const inserts: Array<[string, unknown]> = [];
  return {
    filters,
    inserts,
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
    from(table: string) {
      const query = {
        select: () => query,
        delete: () => query,
        insert: (row: unknown) => { inserts.push([table, row]); return query; },
        upsert: () => query,
        eq: (key: string, value: unknown) => { filters.push([table, key, value]); return query; },
        order: () => query,
        then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
      };
      return query;
    },
  };
}

function request(method: string, body: unknown) {
  return new Request("http://localhost/api/follows", { method, body: JSON.stringify(body) });
}

describe("follow ownership", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.check.mockResolvedValue({ allowed: true }); });

  it("requires authentication for listing, following and unfollowing", async () => {
    const db = client(null);
    mocks.createClient.mockResolvedValue(db);
    expect((await GET()).status).toBe(401);
    expect((await POST(request("POST", { followeeId: authorId }))).status).toBe(401);
    expect((await DELETE(request("DELETE", { followeeId: authorId }))).status).toBe(401);
    expect(db.inserts).toEqual([]);
  });

  it("uses the authenticated reader, ignoring a forged follower ID", async () => {
    const db = client();
    mocks.createClient.mockResolvedValue(db);
    const response = await POST(request("POST", { followeeId: authorId, followerId: authorId }));
    expect(response.status).toBe(200);
    expect(db.inserts).toEqual([["follows", { follower_id: readerId, followee_id: authorId }]]);
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: authorId, actorId: readerId }));
  });

  it("rejects self-following before writing or notifying", async () => {
    const db = client();
    mocks.createClient.mockResolvedValue(db);
    expect((await POST(request("POST", { followeeId: readerId }))).status).toBe(400);
    expect(db.inserts).toEqual([]);
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });

  it("scopes list and removal to the authenticated reader", async () => {
    const db = client();
    mocks.createClient.mockResolvedValue(db);
    expect((await GET()).status).toBe(200);
    expect((await DELETE(request("DELETE", { followeeId: authorId }))).status).toBe(200);
    expect(db.filters.filter(([table, key]) => table === "follows" && key === "follower_id")).toEqual([
      ["follows", "follower_id", readerId], ["follows", "follower_id", readerId],
    ]);
    expect(db.filters).toContainEqual(["follows", "followee_id", authorId]);
    expect(db.filters).toContainEqual(["author_followers", "follower_id", readerId]);
  });
});
