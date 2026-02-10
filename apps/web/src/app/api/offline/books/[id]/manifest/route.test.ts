import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

const { requireOfflineBookAccess, buildChapterContentHash, sha256Hex } = vi.hoisted(() => ({
  requireOfflineBookAccess: vi.fn(),
  buildChapterContentHash: vi.fn(),
  sha256Hex: vi.fn(),
}));

vi.mock("@/lib/offline/server", () => ({
  requireOfflineBookAccess,
}));

vi.mock("@/lib/offline/hash", () => ({
  buildChapterContentHash,
  sha256Hex,
}));

describe("GET /api/offline/books/[id]/manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildChapterContentHash.mockImplementation(async ({ title }: { title: string }) => `hash-${title}`);
    sha256Hex.mockResolvedValue("manifest-hash");
  });

  it("passes through auth/entitlement errors", async () => {
    requireOfflineBookAccess.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "PLUS_SUBSCRIPTION_REQUIRED" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    });

    const response = await GET(new Request("http://localhost/api/offline/books/book-1/manifest"), {
      params: Promise.resolve({ id: "book-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("returns a manifest with chapter hashes and upserts offline metadata", async () => {
    const chapters = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Chapter 1",
        order: 1,
        content: "Hello",
        updated_at: "2026-02-10T10:00:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        title: "Chapter 2",
        order: 2,
        content: "World",
        updated_at: "2026-02-10T10:01:00.000Z",
      },
    ];

    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "chapters") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: chapters, error: null }),
            }),
          }),
        };
      }
      if (table === "offline_manifests") {
        return { upsert };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    requireOfflineBookAccess.mockResolvedValue({
      ok: true,
      context: {
        supabase: { from },
        userId: "user-1",
        book: { id: "book-1" },
        activeVersion: { id: "ver-1" },
        activeLanguageCode: "sv",
      },
    });

    const response = await GET(new Request("http://localhost/api/offline/books/book-1/manifest?lang=sv"), {
      params: Promise.resolve({ id: "book-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bookId).toBe("book-1");
    expect(body.bookVersionId).toBe("ver-1");
    expect(body.manifestHash).toBe("manifest-hash");
    expect(body.chapters).toHaveLength(2);
    expect(body.chapters[0]).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      contentHash: "hash-Chapter 1",
      readerUrl: "/reader/read/11111111-1111-4111-8111-111111111111",
    });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
