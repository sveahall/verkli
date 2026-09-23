import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

const { PUT } = await import("./route");

describe("/api/author/subscription-plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "author-1" },
      response: null,
    });
  });

  it("saves a 49 SEK monthly subscription price", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ upsert })),
    });

    const res = await PUT(
      new Request("http://localhost/api/author/subscription-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          price_monthly: 4900,
          currency: "sek",
          description: "All books included.",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        author_id: "author-1",
        enabled: true,
        price_monthly: 4900,
        currency: "sek",
      }),
      { onConflict: "author_id" }
    );
  });
});
