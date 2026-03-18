import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { requireAuthorRoleForApi, createClient, createAdminClient } = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient,
}));

vi.mock("@/lib/tts/storage", () => ({
  getAudiobookStorageBucket: () => "audiobooks",
}));

function makeSupabaseMock(options?: {
  books?: Array<Record<string, unknown>>;
  audiobookAssets?: Array<Record<string, unknown>>;
  audiobookJobs?: Array<Record<string, unknown>>;
  translationJobs?: Array<Record<string, unknown>>;
  marketingJobs?: Array<Record<string, unknown>>;
}) {
  const books = options?.books ?? [
    { id: "book-1", title: "North Star" },
  ];
  const audiobookAssets = options?.audiobookAssets ?? [
    { book_id: "book-1", audio_path: "north-star/output.mp3", audio_bucket: "audiobooks", created_at: "2026-03-17T10:00:00.000Z" },
  ];
  const audiobookJobs = options?.audiobookJobs ?? [
    {
      id: "job-audio",
      kind: "audiobook_generation",
      status: "processing",
      book_id: "book-1",
      book_version_id: "ver-1",
      language: "sv",
      progress: 42,
      input: { voiceId: "Ryan" },
      output: { currentChapterTitle: "Chapter 4" },
      error: null,
      created_at: "2026-03-17T10:05:00.000Z",
      started_at: "2026-03-17T10:06:00.000Z",
      finished_at: null,
    },
  ];
  const translationJobs = options?.translationJobs ?? [
    {
      id: "ver-en",
      book_id: "book-1",
      language_code: "en",
      status: "done",
      created_at: "2026-03-17T09:00:00.000Z",
      updated_at: "2026-03-17T09:10:00.000Z",
    },
  ];
  const marketingJobs = options?.marketingJobs ?? [
    {
      id: "campaign-1",
      book_id: "book-1",
      channel: "instagram",
      status: "generated",
      headline: "Launch teaser",
      share_url: "https://example.com/campaign-1",
      created_at: "2026-03-17T08:00:00.000Z",
      updated_at: "2026-03-17T08:05:00.000Z",
    },
  ];

  const from = (table: string) => {
    if (table === "books") {
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: books,
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "audiobook_assets") {
      const chain = {
        select: () => chain,
        in: () => chain,
        order: async () => ({
          data: audiobookAssets,
          error: null,
        }),
      };
      return chain;
    }

    if (table === "ai_jobs") {
      const chain = {
        select: () => chain,
        in: () => chain,
        order: () => chain,
        limit: async () => ({
          data: audiobookJobs,
          error: null,
        }),
      };
      return chain;
    }

    if (table === "book_versions") {
      const chain = {
        select: () => chain,
        in: () => chain,
        order: async () => ({
          data: translationJobs,
          error: null,
        }),
      };
      return chain;
    }

    if (table === "marketing_campaigns") {
      const chain = {
        select: () => chain,
        in: () => chain,
        order: async () => ({
          data: marketingJobs,
          error: null,
        }),
      };
      return chain;
    }

    throw new Error(`Unexpected table query: ${table}`);
  };

  return { from };
}

describe("GET /api/author/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
    createAdminClient.mockReturnValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://signed.example.com/audio.mp3" },
            error: null,
          }),
        }),
      },
    });
    createClient.mockResolvedValue(makeSupabaseMock());
  });

  it("aggregates cross-book jobs with book metadata", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs).toHaveLength(3);
    expect(body.jobs[0]).toMatchObject({
      id: "job-audio",
      kind: "audiobook",
      bookId: "book-1",
      bookTitle: "North Star",
      previewUrl: "https://signed.example.com/audio.mp3",
    });
    expect(body.jobs[0].logSummary).toContain("Chapter 4");
    expect(body.jobs[1]).toMatchObject({
      id: "ver-en",
      kind: "translation",
      progress: 100,
      bookTitle: "North Star",
    });
    expect(body.jobs[2]).toMatchObject({
      id: "campaign-1",
      kind: "marketing",
      previewUrl: "https://example.com/campaign-1",
      logSummary: "Launch teaser",
    });
  });

  it("returns an empty collection when the author has no books", async () => {
    createClient.mockResolvedValueOnce(
      makeSupabaseMock({
        books: [],
        audiobookAssets: [],
        audiobookJobs: [],
        translationJobs: [],
        marketingJobs: [],
      })
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jobs).toEqual([]);
  });
});
