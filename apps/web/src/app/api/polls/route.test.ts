import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_POLL_ALREADY_VOTED } from "@/lib/api-errors";
import { createSupabaseClientMock } from "../_test-helpers/supabase";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isPollsEnabled: vi.fn(),
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/flags", () => ({
  isPollsEnabled: mocks.isPollsEnabled,
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

// Force in-memory rate limiter (no Redis) so limits don't leak between test files
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { GET, POST } = await import("./route");
const { POST: votePOST } = await import("./[id]/vote/route");

const AUTHOR_ID = "author-1";
const READER_ID = "reader-1";
const POLL_ID = "c4e6ce8f-8e41-435b-86d9-6f260c4cd727";
const OPTION_ID = "34b589b8-22d6-4922-95ec-ea8c4f0ce4dc";

describe("/api/polls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPollsEnabled.mockReturnValue(true);
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: AUTHOR_ID },
      response: null,
    });
  });

  it("GET returns polls", async () => {
    const polls = [
      {
        id: POLL_ID,
        author_id: AUTHOR_ID,
        question: "Vilken genre vill du läsa härnäst?",
        book_id: null,
        is_active: true,
        closes_at: null,
        created_at: "2026-02-01T10:00:00.000Z",
      },
    ];

    const client = createSupabaseClientMock({
      userId: READER_ID,
      tables: {
        polls: {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: polls, error: null })),
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const res = await GET(new Request("http://localhost/api/polls"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.polls).toEqual(polls);
  });

  it("POST creates a poll", async () => {
    const createdPoll = {
      id: POLL_ID,
      author_id: AUTHOR_ID,
      question: "Vilken genre vill du läsa härnäst?",
      book_id: null,
      is_active: true,
      closes_at: null,
      created_at: "2026-02-02T10:00:00.000Z",
    };

    const createdOptions = [
      {
        id: OPTION_ID,
        poll_id: POLL_ID,
        text: "Fantasy",
        sort_order: 0,
        created_at: "2026-02-02T10:00:00.000Z",
      },
      {
        id: "77d574bc-e8e8-4c8e-b9f1-bdbe72e14566",
        poll_id: POLL_ID,
        text: "Sci-fi",
        sort_order: 1,
        created_at: "2026-02-02T10:00:00.000Z",
      },
    ];

    const client = createSupabaseClientMock({
      tables: {
        polls: {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: createdPoll, error: null })),
            })),
          })),
        },
        poll_options: {
          insert: vi.fn(() => ({
            select: vi.fn(async () => ({ data: createdOptions, error: null })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request("http://localhost/api/polls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "Vilken genre vill du läsa härnäst?",
        options: ["Fantasy", "Sci-fi"],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.poll).toEqual(createdPoll);
    expect(body.options).toEqual(createdOptions);
  });

  it("POST /[id]/vote stores a vote", async () => {
    const client = createSupabaseClientMock({
      userId: READER_ID,
      tables: {
        polls: {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: POLL_ID,
                  is_active: true,
                  closes_at: null,
                },
                error: null,
              })),
            })),
          })),
        },
        poll_options: {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: OPTION_ID, poll_id: POLL_ID },
                  error: null,
                })),
              })),
            })),
          })),
        },
        poll_votes: {
          insert: vi.fn(async () => ({ error: null })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request(`http://localhost/api/polls/${POLL_ID}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ option_id: OPTION_ID }),
    });

    const res = await votePOST(req, { params: Promise.resolve({ id: POLL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("returns ALREADY_VOTED on duplicate vote", async () => {
    const client = createSupabaseClientMock({
      userId: READER_ID,
      tables: {
        polls: {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: POLL_ID,
                  is_active: true,
                  closes_at: null,
                },
                error: null,
              })),
            })),
          })),
        },
        poll_options: {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: { id: OPTION_ID, poll_id: POLL_ID },
                  error: null,
                })),
              })),
            })),
          })),
        },
        poll_votes: {
          insert: vi.fn(async () => ({
            error: { code: "23505", message: "duplicate vote" },
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request(`http://localhost/api/polls/${POLL_ID}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ option_id: OPTION_ID }),
    });

    const res = await votePOST(req, { params: Promise.resolve({ id: POLL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe(E_POLL_ALREADY_VOTED);
  });
});
