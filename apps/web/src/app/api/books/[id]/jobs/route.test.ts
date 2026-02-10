import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { requireAuthorRoleForApi, createClient } = vi.hoisted(() => ({
  requireAuthorRoleForApi: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

const originalEnv = {
  NEXT_PUBLIC_AUDIOBOOK_ENABLED: process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED,
  AUDIOBOOK_ENABLED: process.env.AUDIOBOOK_ENABLED,
};

function makeSupabaseMock() {
  const from = (table: string) => {
    if (table === "books") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: "book-1", author_id: "user-1" },
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "ai_jobs") {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return chain;
        },
        is: (column: string, value: unknown) => {
          filters[`is:${column}`] = value;
          return chain;
        },
        order: () => chain,
        limit: async () => {
          if (filters.book_id === "book-1") {
            return {
              data: [
                {
                  id: "job-audio",
                  kind: "audiobook_generation",
                  status: "processing",
                  book_id: "book-1",
                  book_version_id: "ver-1",
                  language: "sv",
                  progress: 10,
                  input: { voiceId: "sv_SE-nst-medium" },
                  output: { totalChapters: 10, completedChapters: 1 },
                  error: "Storage upload failed: /tmp/private.log",
                  created_at: "2026-02-07T10:00:00.000Z",
                  started_at: "2026-02-07T10:00:05.000Z",
                  finished_at: null,
                },
              ],
              error: null,
            };
          }

          if (filters["is:book_id"] === null) {
            return { data: [], error: null };
          }

          return { data: [], error: null };
        },
      };
      return chain;
    }

    if (table === "book_imports") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
      };
      return chain;
    }

    if (table === "book_versions") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: async () => ({
          data: [
            {
              id: "ver-2",
              language_code: "en",
              status: "done",
              created_at: "2026-02-07T10:01:00.000Z",
              updated_at: "2026-02-07T10:01:15.000Z",
            },
          ],
          error: null,
        }),
      };
      return chain;
    }

    throw new Error(`Unexpected table query: ${table}`);
  };

  return { from };
}

describe("GET /api/books/[id]/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = "false";
    process.env.AUDIOBOOK_ENABLED = "false";
    requireAuthorRoleForApi.mockResolvedValue({
      user: { id: "user-1" },
      response: null,
    });
    createClient.mockResolvedValue(makeSupabaseMock());
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUDIOBOOK_ENABLED = originalEnv.NEXT_PUBLIC_AUDIOBOOK_ENABLED;
    process.env.AUDIOBOOK_ENABLED = originalEnv.AUDIOBOOK_ENABLED;
  });

  it("filters out audiobook jobs when feature flag is off", async () => {
    const req = new Request("http://localhost/api/books/book-1/jobs");

    const res = await GET(req, { params: Promise.resolve({ id: "book-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0].kind).toBe("translation");
    expect(body.jobs[0].status).toBe("completed");
    expect(body.activeCount).toBe(0);
    expect(body.summary).toEqual({ translation: "completed" });
  });
});
