import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  E_AUDIOBOOK_FEATURE_DISABLED,
  E_BOOK_NOT_FOUND,
  E_FORBIDDEN,
  E_INVALID_BOOK_ID,
  E_INVALID_JSON,
  E_NOT_AUTHENTICATED,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

// Contract tests for the WP-03 listening-position + listen-event endpoint.

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  canUserReadBook: vi.fn(),
  logAnalyticsEvent: vi.fn(),
  isAudiobookEnabled: vi.fn(),
  assertPublicEnv: vi.fn(),
  rateCheck: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/books/access", () => ({ canUserReadBook: mocks.canUserReadBook }));
vi.mock("@/lib/analytics/events", () => ({ logAnalyticsEvent: mocks.logAnalyticsEvent }));
vi.mock("@/lib/flags", () => ({ isAudiobookEnabled: mocks.isAudiobookEnabled }));
vi.mock("@/lib/env", () => ({ assertPublicEnv: mocks.assertPublicEnv }));
vi.mock("@/lib/rate-limit", () => ({
  createPerUserRateLimiter: () => ({ check: mocks.rateCheck }),
}));

const { POST } = await import("./route");

type UpsertCall = { row: Record<string, unknown>; options: Record<string, unknown> | undefined };

function makeSessionClient(options?: {
  user?: { id: string } | null;
  upsertError?: { code?: string; message: string } | null;
}) {
  const upserts: UpsertCall[] = [];
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options?.user === undefined ? { id: USER_ID } : options.user },
      })),
    },
    from: vi.fn((table: string) => {
      if (table !== "listening_positions") {
        throw new Error(`Unexpected session table ${table}`);
      }
      return {
        upsert: vi.fn(
          async (row: Record<string, unknown>, upsertOptions?: Record<string, unknown>) => {
            upserts.push({ row, options: upsertOptions });
            return { error: options?.upsertError ?? null };
          }
        ),
      };
    }),
  };
  return { client, upserts };
}

function makeAdminClient(options?: {
  chapter?: Record<string, unknown> | null;
  book?: Record<string, unknown> | null;
}) {
  const chapter =
    options?.chapter === undefined ? { id: CHAPTER_ID, book_id: BOOK_ID } : options.chapter;
  const book =
    options?.book === undefined
      ? {
          id: BOOK_ID,
          status: "PUBLISHED",
          author_id: "author-1",
          price_amount: 0,
          pricing_model: "book_only",
        }
      : options.book;

  const rowFor = (table: string) => (table === "chapters" ? chapter : book);

  return {
    from: vi.fn((table: string) => {
      if (table !== "chapters" && table !== "books") {
        throw new Error(`Unexpected admin table ${table}`);
      }
      const chain: Record<string, unknown> = {};
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: rowFor(table), error: null }));
      return { select: vi.fn(() => chain) };
    }),
  };
}

function makeRequest(body: unknown, options?: { raw?: string }) {
  return new Request(`http://localhost/api/books/${BOOK_ID}/audiobook/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: options?.raw ?? JSON.stringify(body),
  });
}

function routeParams(bookId: string = BOOK_ID) {
  return { params: Promise.resolve({ id: bookId }) };
}

describe("POST /api/books/[id]/audiobook/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAudiobookEnabled.mockReturnValue(true);
    mocks.assertPublicEnv.mockReturnValue(undefined);
    mocks.rateCheck.mockResolvedValue({ allowed: true });
    mocks.canUserReadBook.mockResolvedValue(true);
    mocks.logAnalyticsEvent.mockResolvedValue(undefined);
  });

  it("returns 503 when the audiobook feature is disabled", async () => {
    mocks.isAudiobookEnabled.mockReturnValue(false);

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 10 }),
      routeParams()
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: E_AUDIOBOOK_FEATURE_DISABLED,
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid book id before touching the database", async () => {
    const response = await POST(makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 1 }), routeParams("not-a-uuid"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: E_INVALID_BOOK_ID });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns 401 for anonymous callers and does no lookups", async () => {
    // Anonymous listening is measured by `audio_requested` from the play route;
    // a position row needs an owner, so there is nothing to do here.
    const { client } = makeSessionClient({ user: null });
    mocks.createClient.mockResolvedValue(client);

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 10 }),
      routeParams()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: E_NOT_AUTHENTICATED });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("returns 429 with retryAfterSeconds when the caller is rate limited", async () => {
    const { client } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.rateCheck.mockResolvedValue({ allowed: false, retryAfterSeconds: 17 });

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 10 }),
      routeParams()
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: E_RATE_LIMIT_EXCEEDED,
      retryAfterSeconds: 17,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    const { client } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);

    const response = await POST(makeRequest(null, { raw: "{not json" }), routeParams());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: E_INVALID_JSON });
  });

  it.each([
    ["a non-uuid chapterId", { chapterId: "nope", positionSeconds: 10 }],
    ["a negative position", { chapterId: CHAPTER_ID, positionSeconds: -1 }],
    ["a NaN position", { chapterId: CHAPTER_ID, positionSeconds: Number.NaN }],
    ["an absurd position", { chapterId: CHAPTER_ID, positionSeconds: 1e12 }],
    ["a zero duration", { chapterId: CHAPTER_ID, positionSeconds: 10, durationSeconds: 0 }],
    // audio_requested is emitted server-side by the play route only. Accepting
    // it here would let any client forge the unbypassable floor metric.
    ["the server-only audio_requested event", { chapterId: CHAPTER_ID, positionSeconds: 10, event: "audio_requested" }],
    ["an unknown event", { chapterId: CHAPTER_ID, positionSeconds: 10, event: "listen_middle" }],
  ])("returns 400 for %s", async (_label, body) => {
    const { client } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);

    const response = await POST(makeRequest(body), routeParams());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: E_VALIDATION_FAILED });
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("returns 404 when the chapter does not belong to the book", async () => {
    const { client } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient({ chapter: null }));

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 10 }),
      routeParams()
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: E_BOOK_NOT_FOUND });
  });

  it("returns 404 for an unpublished book the caller does not own", async () => {
    const { client } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(
      makeAdminClient({
        book: { id: BOOK_ID, status: "DRAFT", author_id: "someone-else", price_amount: 0, pricing_model: "book_only" },
      })
    );

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 10 }),
      routeParams()
    );

    expect(response.status).toBe(404);
    expect(mocks.canUserReadBook).not.toHaveBeenCalled();
  });

  it("lets the author save a position on their own unpublished book", async () => {
    const { client, upserts } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(
      makeAdminClient({
        book: { id: BOOK_ID, status: "DRAFT", author_id: USER_ID, price_amount: 0, pricing_model: "book_only" },
      })
    );

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 10, event: "listen_start" }),
      routeParams()
    );

    expect(response.status).toBe(200);
    expect(upserts).toHaveLength(1);
    // The author path skips the paywall helper entirely.
    expect(mocks.canUserReadBook).not.toHaveBeenCalled();
    expect(mocks.logAnalyticsEvent.mock.calls[0][1].props).toMatchObject({ isAuthorPreview: true });
  });

  it("returns 403 when the reader has no access to a paid book", async () => {
    const { client, upserts } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient());
    mocks.canUserReadBook.mockResolvedValue(false);

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 10, event: "listen_start" }),
      routeParams()
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: E_FORBIDDEN });
    expect(upserts).toHaveLength(0);
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("upserts the position on (user_id, chapter_id) with the session client", async () => {
    const { client, upserts } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient());

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 123.5, durationSeconds: 600 }),
      routeParams()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, saved: true });
    expect(upserts).toHaveLength(1);
    // Session client, not admin: RLS is what scopes the row to its owner.
    expect(client.from).toHaveBeenCalledWith("listening_positions");
    expect(upserts[0].options).toEqual({ onConflict: "user_id,chapter_id" });
    expect(upserts[0].row).toMatchObject({
      user_id: USER_ID,
      book_id: BOOK_ID,
      chapter_id: CHAPTER_ID,
      position_seconds: 123.5,
      duration_seconds: 600,
    });
    expect(upserts[0].row.updated_at).toEqual(expect.any(String));
  });

  it("omits `completed` mid-chapter so an earlier true is never overwritten", async () => {
    // PostgREST merge-duplicates only writes the keys present in the payload, so
    // leaving `completed` out is what makes completion sticky without a read.
    const { client, upserts } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient());

    await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 30, durationSeconds: 600, event: "listen_progress" }),
      routeParams()
    );

    expect(upserts[0].row).not.toHaveProperty("completed");
  });

  it("does not save a position without emitting an event when none was requested", async () => {
    const { client, upserts } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient());

    await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 30, durationSeconds: 600 }),
      routeParams()
    );

    expect(upserts).toHaveLength(1);
    expect(mocks.logAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("marks the chapter completed on listen_complete", async () => {
    const { client, upserts } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient());

    await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 600, durationSeconds: 600, event: "listen_complete" }),
      routeParams()
    );

    expect(upserts[0].row).toMatchObject({ completed: true });
    expect(mocks.logAnalyticsEvent.mock.calls[0][1]).toMatchObject({
      eventType: "listen_complete",
      userId: USER_ID,
      bookId: BOOK_ID,
      props: expect.objectContaining({ completed: true, percent: 1 }),
    });
  });

  it("marks the chapter completed when the reader stops inside the tail margin", async () => {
    // Scrubbing into the last seconds and leaving counts as finished, even
    // though `ended` never fires.
    const { client, upserts } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient());

    await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 595, durationSeconds: 600 }),
      routeParams()
    );

    expect(upserts[0].row).toMatchObject({ completed: true });
  });

  it("emits listen_start through the admin client with position props", async () => {
    const { client } = makeSessionClient();
    const admin = makeAdminClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(admin);

    await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 150.4, durationSeconds: 600, event: "listen_start" }),
      routeParams()
    );

    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(1);
    const [passedClient, payload] = mocks.logAnalyticsEvent.mock.calls[0];
    // analytics_events has no SELECT policy and an INSERT policy keyed on
    // auth.uid(); service-role is the only correct emission path for every actor.
    expect(passedClient).toBe(admin);
    expect(payload).toMatchObject({
      eventType: "listen_start",
      userId: USER_ID,
      bookId: BOOK_ID,
      props: {
        chapterId: CHAPTER_ID,
        positionSeconds: 150,
        durationSeconds: 600,
        percent: 0.251,
        completed: false,
      },
    });
  });

  it("reports percent as null when the player has no duration yet", async () => {
    const { client } = makeSessionClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient());

    await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 30, event: "listen_start" }),
      routeParams()
    );

    expect(mocks.logAnalyticsEvent.mock.calls[0][1].props).toMatchObject({
      durationSeconds: null,
      percent: null,
    });
  });

  it("still emits the event and returns 200 when the position table is missing", async () => {
    // The migration may not be applied yet. Losing a resume point must not break
    // playback, and must not take the listening metric down with it.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = makeSessionClient({
      upsertError: { code: "PGRST205", message: "Could not find the table" },
    });
    mocks.createClient.mockResolvedValue(client);
    mocks.createAdminClient.mockReturnValue(makeAdminClient());

    const response = await POST(
      makeRequest({ chapterId: CHAPTER_ID, positionSeconds: 30, event: "listen_progress" }),
      routeParams()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, saved: false });
    expect(mocks.logAnalyticsEvent).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[audiobook progress] position upsert failed",
      expect.objectContaining({
        code: "PGRST205",
        hint: "apply supabase/migrations/20260818120000_listening_positions.sql",
      })
    );
    warn.mockRestore();
  });
});
