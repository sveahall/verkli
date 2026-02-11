import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

const { GET } = await import("./route");

function makeSupabaseMock() {
  const from = (table: string) => {
    if (table !== "genres") throw new Error(`Unexpected table: ${table}`);

    let orderCalls = 0;
    const chain = {
      select: () => chain,
      order: () => {
        orderCalls += 1;
        if (orderCalls < 2) return chain;
        return Promise.resolve({
          data: [
            {
              id: "genre-1",
              slug: "fantasy",
              name_sv: "Fantasy",
              name_en: "Fantasy",
              icon: "🧙",
              display_order: 1,
            },
          ],
          error: null,
        });
      },
    };

    return chain;
  };

  return { from };
}

describe("GET /api/genres", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns genre list", async () => {
    mocks.createClient.mockResolvedValueOnce(makeSupabaseMock());

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.genres).toHaveLength(1);
    expect(body.genres[0]).toMatchObject({ id: "genre-1", slug: "fantasy" });
  });
});
