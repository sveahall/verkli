import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const { requireOfflineBookAccess, buildChapterContentHash } = vi.hoisted(() => ({
  requireOfflineBookAccess: vi.fn(),
  buildChapterContentHash: vi.fn(),
}));

vi.mock("@/lib/offline/server", () => ({
  requireOfflineBookAccess,
}));

vi.mock("@/lib/offline/hash", () => ({
  buildChapterContentHash,
}));

describe("POST /api/offline/books/[id]/chapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildChapterContentHash.mockImplementation(async ({ title }: { title: string }) => `hash-${title}`);
  });

  it("passes through auth/entitlement errors", async () => {
    requireOfflineBookAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "PLUS_SUBSCRIPTION_REQUIRED" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const request = new Request("http://localhost/api/offline/books/book-1/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookVersionId: "11111111-1111-4111-8111-111111111111",
        chapterIds: ["22222222-2222-4222-8222-222222222222"],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: "book-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns chapter content in batch order", async () => {
    const bookVersionId = "11111111-1111-4111-8111-111111111111";
    const chapterIdOne = "22222222-2222-4222-8222-222222222222";
    const chapterIdTwo = "33333333-3333-4333-8333-333333333333";

    const chaptersData = [
      {
        id: chapterIdTwo,
        title: "Chapter 2",
        order: 2,
        content: "Second",
        updated_at: "2026-02-10T10:01:00.000Z",
      },
      {
        id: chapterIdOne,
        title: "Chapter 1",
        order: 1,
        content: "First",
        updated_at: "2026-02-10T10:00:00.000Z",
      },
    ];

    const from = vi.fn((table: string) => {
      if (table === "chapters") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: async () => ({ data: chaptersData, error: null }),
        };
        return chain;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    requireOfflineBookAccess.mockResolvedValue({
      ok: true,
      context: {
        supabase: { from },
        userId: "user-1",
        book: { id: "book-1" },
        activeVersion: { id: bookVersionId },
        activeLanguageCode: "en",
      },
    });

    const request = new Request("http://localhost/api/offline/books/book-1/chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookVersionId,
        chapterIds: [chapterIdOne, chapterIdTwo],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ id: "book-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bookVersionId).toBe(bookVersionId);
    expect(body.chapters).toHaveLength(2);
    expect(body.chapters[0]).toMatchObject({
      id: chapterIdOne,
      title: "Chapter 1",
      content: "First",
      contentHash: "hash-Chapter 1",
    });
    expect(body.chapters[1]).toMatchObject({
      id: chapterIdTwo,
      title: "Chapter 2",
      content: "Second",
      contentHash: "hash-Chapter 2",
    });
  });
});
