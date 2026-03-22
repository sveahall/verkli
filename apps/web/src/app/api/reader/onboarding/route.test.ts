import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_NOT_AUTHENTICATED } from "@/lib/api-errors";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  enqueueRecommendationsJob: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/recommendations-queue", () => ({
  enqueueRecommendationsJob: mocks.enqueueRecommendationsJob,
}));

const { POST } = await import("./route");

function makeAuthedSupabase() {
  const from = (table: string) => {
    if (table === "reader_genre_preferences") {
      return {
        upsert: async () => ({ error: null }),
        delete: () => ({
          eq: () => ({
            not: async () => ({ error: null }),
          }),
        }),
      };
    }

    if (table === "reader_book_signals") {
      return {
        upsert: async () => ({ error: null }),
      };
    }

    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { preferences: {} }, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  };

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "reader-1" } } }),
    },
    from,
  };
}

describe("POST /api/reader/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.createClient.mockResolvedValueOnce({
      auth: {
        getUser: async () => ({ data: { user: null } }),
      },
      from: vi.fn(),
    });

    const req = new Request("http://localhost/api/reader/onboarding", {
      method: "POST",
      body: JSON.stringify({ genres: ["genre-1"] }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe(E_NOT_AUTHENTICATED);
  });

  it("stores onboarding preferences and returns success", async () => {
    mocks.createClient.mockResolvedValueOnce(makeAuthedSupabase());
    mocks.enqueueRecommendationsJob.mockResolvedValueOnce("job-1");

    const req = new Request("http://localhost/api/reader/onboarding", {
      method: "POST",
      body: JSON.stringify({
        genres: ["genre-1", "genre-2"],
        preferences: {
          fiction_ratio: 0.7,
          reading_speed: 320,
          languages: ["sv", "en"],
        },
        bookSignals: [{ bookId: "book-1", signal: "like" }],
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      genreCount: 2,
      queued: true,
      recommendationsJobId: "job-1",
    });
    expect(mocks.enqueueRecommendationsJob).toHaveBeenCalledWith({
      userId: "reader-1",
      trigger: "manual",
    });
  });
});
