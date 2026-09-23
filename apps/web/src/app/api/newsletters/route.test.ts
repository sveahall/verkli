import { beforeEach, describe, expect, it, vi } from "vitest";
import { E_NEWSLETTERS_FEATURE_DISABLED } from "@/lib/api-errors";
import { createSupabaseClientMock } from "../_test-helpers/supabase";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isNewslettersEnabled: vi.fn(),
  requireAuthorRoleForApi: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/flags", () => ({
  isNewslettersEnabled: mocks.isNewslettersEnabled,
}));

vi.mock("@/lib/auth/require-author", () => ({
  requireAuthorRoleForApi: mocks.requireAuthorRoleForApi,
}));

// Force in-memory rate limiter (no Redis)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, getRedisUrl: () => null, getRedisConnectionOptions: () => undefined, getRedisClientOptions: () => undefined };
});

const { GET, POST } = await import("./route");
const { POST: subscribePOST } = await import("./subscribe/route");

const AUTHOR_ID = "author-1";
const READER_ID = "reader-1";
const AUTHOR_UUID = "11111111-1111-4111-8111-111111111111";

describe("/api/newsletters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNewslettersEnabled.mockReturnValue(true);
    mocks.requireAuthorRoleForApi.mockResolvedValue({
      user: { id: AUTHOR_ID },
      response: null,
    });
  });

  it("GET returns newsletters", async () => {
    const newsletters = [
      {
        id: "nl-1",
        author_id: AUTHOR_ID,
        subject: "Weekly update",
        body_html: "<p>Hello</p>",
        body_text: "Hello",
        status: "draft",
        sent_at: null,
        recipient_count: 0,
        created_at: "2026-02-01T10:00:00.000Z",
      },
    ];

    const client = createSupabaseClientMock({
      tables: {
        newsletters: {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({ data: newsletters, error: null })),
            })),
          })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.newsletters).toEqual(newsletters);
  });

  it("POST creates a newsletter", async () => {
    const created = {
      id: "nl-2",
      author_id: AUTHOR_ID,
      subject: "New release",
      body_html: "<p>Now live</p>",
      body_text: "Now live",
      status: "draft",
      sent_at: null,
      recipient_count: 0,
      created_at: "2026-02-02T10:00:00.000Z",
    };

    let insertedPayload: Record<string, unknown> | null = null;

    const client = createSupabaseClientMock({
      tables: {
        newsletters: {
          insert: vi.fn((payload: Record<string, unknown>) => {
            insertedPayload = payload;
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: created, error: null })),
              })),
            };
          }),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request("http://localhost/api/newsletters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: "New release",
        bodyHtml: "<p>Now live</p>",
        bodyText: "Now live",
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.newsletter).toEqual(created);
    expect(insertedPayload).toMatchObject({
      author_id: AUTHOR_ID,
      subject: "New release",
      body_html: "<p>Now live</p>",
      body_text: "Now live",
    });
  });

  it("POST /subscribe subscribes a reader", async () => {
    const client = createSupabaseClientMock({
      userId: READER_ID,
      tables: {
        newsletter_subscriptions: {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
          insert: vi.fn(async () => ({ error: null })),
        },
      },
    });

    mocks.createClient.mockResolvedValue(client as never);

    const req = new Request("http://localhost/api/newsletters/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ authorId: AUTHOR_UUID }),
    });

    const res = await subscribePOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("returns feature flag error when disabled", async () => {
    mocks.isNewslettersEnabled.mockReturnValue(false);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe(E_NEWSLETTERS_FEATURE_DISABLED);
    expect(mocks.requireAuthorRoleForApi).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
