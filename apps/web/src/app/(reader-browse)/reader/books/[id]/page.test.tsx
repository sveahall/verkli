import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  versions: [] as Array<{ id: string; language_code: string; published_at: string | null }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      let versions = state.versions;
      const query = {
        select: () => query,
        eq: () => query,
        not: (column: string, operator: string, value: unknown) => {
          if (column === "published_at" && operator === "is" && value === null) {
            versions = versions.filter((version) => version.published_at !== null);
          }
          return query;
        },
        order: async () => ({ data: versions, error: null }),
        maybeSingle: async () => ({ data: table === "books" ? {
          id: "book", title: "The letter", status: "PUBLISHED", original_language: "en", language: "en",
        } : null, error: null }),
      };
      return query;
    },
  }),
}));

const { generateMetadata } = await import("./page");

describe("published reader edition selection", () => {
  beforeEach(() => {
    state.versions = [
      { id: "english-draft", language_code: "en", published_at: null },
      { id: "swedish-release", language_code: "sv", published_at: "2026-09-20T16:28:00Z" },
    ];
  });

  it("opens the published translation when the owner can also see the original draft", async () => {
    const result = await generateMetadata({ params: Promise.resolve({ id: "book" }) });
    expect(result.title).not.toBe("Book not found");
    expect(result.description).toContain("in Swedish");
  });

  it("prefers a published original when both editions are published", async () => {
    state.versions[0].published_at = "2026-09-20T16:28:00Z";
    const result = await generateMetadata({ params: Promise.resolve({ id: "book" }) });
    expect(result.description).toContain("in English");
  });

  it("honors an explicit published language", async () => {
    state.versions[0].published_at = "2026-09-20T16:28:00Z";
    const result = await generateMetadata({
      params: Promise.resolve({ id: "book" }), searchParams: Promise.resolve({ lang: "sv" }),
    });
    expect(result.description).toContain("in Swedish");
  });

  it("does not expose an unpublished book edition", async () => {
    state.versions = [state.versions[0]];
    const result = await generateMetadata({ params: Promise.resolve({ id: "book" }) });
    expect(result.title).toBe("Book not found");
  });
});
