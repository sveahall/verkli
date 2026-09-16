import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), scoreSimilarBooks: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/flags", () => ({ getRecommendationsEnabled: () => true }));
vi.mock("@/lib/recommendations/scoring", () => ({ scoreSimilarBooks: mocks.scoreSimilarBooks }));
const { default: SimilarBooksRail } = await import("./SimilarBooksRail");

describe("SimilarBooksRail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) });
  });

  it("does not take down book details when optional recommendations fail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.scoreSimilarBooks.mockRejectedValueOnce(new Error("Could not load recommendation candidates."));
    await expect(SimilarBooksRail({ bookId: "book", authorId: "author", language: "en" })).resolves.toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
