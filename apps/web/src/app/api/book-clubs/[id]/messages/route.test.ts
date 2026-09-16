import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/flags", () => ({ isBookClubsEnabled: () => true }));
const { GET, POST } = await import("./route");
const id = "11111111-1111-4111-8111-111111111111";
function fixture(member = true) {
  const range = vi.fn(async () => ({ data: [{ id: "newer", created_at: "2026-09-16T12:00:00Z" }, { id: "older", created_at: "2026-09-16T11:00:00Z" }], error: null }));
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: null, error: { message: "Empty message violates constraint" } }) }) }));
  const membership = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: async () => ({ data: member ? { user_id: "reader" } : null, error: null }) };
  const messages = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range, insert };
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) }, from: (table: string) => table === "book_club_members" ? membership : messages });
  return { range, insert };
}
describe("club chat messages", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); });
  it("returns the latest page in conversation order", async () => {
    fixture();
    const response = await GET(new Request("https://example.com/messages"), { params: Promise.resolve({ id }) });
    expect((await response.json()).messages.map((message: { id: string }) => message.id)).toEqual(["older", "newer"]);
  });
  it("uses bounded defaults for invalid pagination", async () => {
    const { range } = fixture();
    await GET(new Request("https://example.com/messages?page=invalid&limit=nope"), { params: Promise.resolve({ id }) });
    expect(range).toHaveBeenCalledWith(0, 49);
  });
  it("rejects whitespace-only messages before touching persistence", async () => {
    const { insert } = fixture();
    const response = await POST(new Request("https://example.com/messages", { method: "POST", body: JSON.stringify({ content: "   " }) }), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
  it("does not expose a private conversation to a nonmember", async () => {
    const { range } = fixture(false);
    const response = await GET(new Request("https://example.com/messages"), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(403);
    expect(range).not.toHaveBeenCalled();
  });
});
