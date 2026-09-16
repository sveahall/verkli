import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/flags", () => ({ isPollsEnabled: () => true }));
const { GET } = await import("./route");
const id = "11111111-1111-4111-8111-111111111111";
function setup(visible = true) {
  const scopedVotes = { select: () => ({ eq: async () => ({ data: [{ option_id: "a" }], error: null }) }) };
  const options = [{ id: "a", text: "A", sort_order: 0 }, { id: "b", text: "B", sort_order: 1 }];
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: "reader" } } }) }, from: (table: string) => table === "polls" ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visible ? { id } : null, error: null }) }) }) } : table === "poll_options" ? { select: () => ({ eq: () => ({ order: async () => ({ data: options, error: null }) }) }) } : scopedVotes });
  const filters: Record<string, string> = {};
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn((key: string, value: string) => { filters[key] = value; return chain; }), then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ count: filters.option_id === "a" ? 2 : 1, error: null })) };
  mocks.admin.mockReturnValue({ from: vi.fn(() => chain) });
  return chain;
}

describe("poll aggregate results", () => {
  beforeEach(() => vi.clearAllMocks());
  it("counts all participants without exposing voter identities", async () => {
    const query = setup();
    const response = await GET(new Request("https://example.com"), { params: Promise.resolve({ id }) });
    expect(await response.json()).toEqual({ results: [{ option_id: "a", text: "A", count: 2 }, { option_id: "b", text: "B", count: 1 }], totalVotes: 3 });
    expect(query.select).toHaveBeenCalledWith("option_id", { count: "exact", head: true });
    expect(query.eq).toHaveBeenCalledWith("poll_id", id);
  });
  it("never bypasses visibility for an inaccessible poll", async () => {
    setup(false);
    const response = await GET(new Request("https://example.com"), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(404);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
