import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminRoleForApi: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminRoleForApi: mocks.requireAdminRoleForApi,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

const { GET } = await import("./route");

/**
 * Build a chainable Supabase query stub. Every chain method returns the same
 * stub; the eventual `.then(...)` (await) resolves with the configured value.
 * Lets a single object answer .select().eq().not().gte().lt() etc. — the
 * funnel route uses a different chain per table, so we configure a per-table
 * resolver and route via the table name passed to `from`.
 */
type Resolver = (chain: { ops: Array<[string, unknown[]]> }) => unknown;

function makeAdminClient(byTable: Record<string, Resolver | Resolver[]>) {
  const callsByTable: Record<string, number> = {};

  return {
    from(table: string) {
      const idx = callsByTable[table] ?? 0;
      callsByTable[table] = idx + 1;
      const config = byTable[table];
      if (!config) {
        throw new Error(`Unexpected from(${table}) — no mock configured`);
      }
      const resolver = Array.isArray(config) ? config[idx] ?? config[config.length - 1] : config;

      const ops: Array<[string, unknown[]]> = [];
      // Chain holds heterogeneous shapes: passthrough fns return the chain,
      // `then` resolves with the configured value. Use `unknown` and cast at
      // the assignment sites.
      const chain: Record<string, unknown> = {};
      const passthrough = (name: string) => {
        chain[name] = (...args: unknown[]) => {
          ops.push([name, args]);
          return chain;
        };
      };
      for (const m of ["select", "eq", "neq", "gte", "lte", "lt", "gt", "not", "in", "ilike", "or", "order", "limit", "range"]) {
        passthrough(m);
      }
      // Terminal: awaiting the chain calls then() once.
      chain.then = (resolve: (value: unknown) => void) => {
        resolve(resolver({ ops }));
      };
      return chain;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminRoleForApi.mockResolvedValue({ user: { id: "admin-1" }, response: null });
});

describe("GET /api/admin/metrics/funnel", () => {
  it("returns 401/403 response from requireAdminRoleForApi when caller is not admin", async () => {
    const forbidden = new Response("forbidden", { status: 403 });
    mocks.requireAdminRoleForApi.mockResolvedValueOnce({ user: null, response: forbidden });
    mocks.createAdminClient.mockReturnValue(makeAdminClient({}));

    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 500 when analytics_events load fails", async () => {
    mocks.createAdminClient.mockReturnValue(
      makeAdminClient({
        analytics_events: () => ({
          data: null,
          error: { message: "boom", code: "X" },
        }),
      })
    );

    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("returns funnel + cohort structure with zero counts when tables are empty", async () => {
    mocks.createAdminClient.mockReturnValue(
      makeAdminClient({
        // First call: analytics_events for author/reader breakdown (rows view).
        // Subsequent calls: first_read distinct user_id, retention recent, retention prior.
        analytics_events: [
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
        ],
        waitlist: () => ({ count: 0, error: null }),
        reader_waitlist: () => ({ count: 0, error: null }),
        user_flags: () => ({ count: 0, error: null }),
        books: () => ({ data: [], error: null }),
      })
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty("since");
    expect(body).toHaveProperty("author");
    expect(body).toHaveProperty("reader");
    expect(Array.isArray(body.author)).toBe(true);
    expect(Array.isArray(body.reader)).toBe(true);

    expect(body).toHaveProperty("cohort");
    expect(body.cohort).toMatchObject({
      waitlist_signups: 0,
      beta_grants: 0,
      first_publish: 0,
      first_read: 0,
      retention_7d: { rate: 0, returning: 0, eligible: 0, window_days: 7 },
    });
  });

  it("aggregates cohort metrics correctly across signup, grant, publish, and read flows", async () => {
    mocks.createAdminClient.mockReturnValue(
      makeAdminClient({
        analytics_events: [
          // 1) author/reader event breakdown (last 7d snapshot)
          () => ({
            data: [
              { event_type: "book_view", event_name: null, path: "/reader/books/1" },
              { event_type: "start_reading", event_name: null, path: "/reader/read/9" },
              { event_type: "publish_click", event_name: null, path: "/author/books/2" },
            ],
            error: null,
          }),
          // 2) first_read: distinct user_id over start_reading
          () => ({
            data: [
              { user_id: "user-a" },
              { user_id: "user-b" },
              { user_id: "user-a" }, // duplicate ignored by Set
            ],
            error: null,
          }),
          // 3) retention recent (last 7d)
          () => ({
            data: [{ user_id: "user-a" }, { user_id: "user-b" }, { user_id: "user-c" }],
            error: null,
          }),
          // 4) retention prior (7-14d ago)
          () => ({
            data: [{ user_id: "user-a" }, { user_id: "user-b" }],
            error: null,
          }),
        ],
        waitlist: () => ({ count: 12, error: null }),
        reader_waitlist: () => ({ count: 8, error: null }),
        user_flags: () => ({ count: 5, error: null }),
        books: () => ({
          data: [
            { author_id: "author-1" },
            { author_id: "author-2" },
            { author_id: "author-1" }, // duplicate dropped via Set
          ],
          error: null,
        }),
      })
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.cohort.waitlist_signups).toBe(20); // 12 + 8
    expect(body.cohort.beta_grants).toBe(5);
    expect(body.cohort.first_publish).toBe(2); // distinct authors
    expect(body.cohort.first_read).toBe(2); // distinct user_a, user_b
    expect(body.cohort.retention_7d.eligible).toBe(2);
    expect(body.cohort.retention_7d.returning).toBe(2);
    expect(body.cohort.retention_7d.rate).toBe(1);
    expect(body.cohort.retention_7d.window_days).toBe(7);

    // Author/reader breakdown still works.
    const author = body.author as Array<{ event_name: string; count: number }>;
    const reader = body.reader as Array<{ event_name: string; count: number }>;
    expect(author.find((e) => e.event_name === "publish_click")?.count).toBe(1);
    expect(reader.find((e) => e.event_name === "book_view")?.count).toBe(1);
    expect(reader.find((e) => e.event_name === "start_reading")?.count).toBe(1);
  });

  it("does not collapse the dashboard when one cohort metric query fails", async () => {
    mocks.createAdminClient.mockReturnValue(
      makeAdminClient({
        analytics_events: [
          () => ({ data: [], error: null }),
          () => ({ data: [{ user_id: "user-a" }], error: null }),
          () => ({ data: [], error: null }),
          () => ({ data: [], error: null }),
        ],
        waitlist: () => ({ count: 3, error: null }),
        reader_waitlist: () => ({
          count: null,
          error: { message: "RLS denied", code: "42501" },
        }),
        user_flags: () => ({ count: 1, error: null }),
        books: () => ({ data: [], error: null }),
      })
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Failed reader_waitlist count is logged + treated as zero. Total = 3.
    expect(body.cohort.waitlist_signups).toBe(3);
    expect(body.cohort.beta_grants).toBe(1);
    expect(body.cohort.first_read).toBe(1);
  });
});
