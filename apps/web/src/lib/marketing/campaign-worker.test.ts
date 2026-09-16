import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processor: null as null | ((job: unknown) => Promise<void>),
  generate: vi.fn(),
  from: vi.fn(),
}));
vi.mock("../../../scripts/load-dotenv", () => ({}));
vi.mock("../../../scripts/sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("@/lib/env", () => ({ assertServerEnv: vi.fn(), getRedisConnectionOptions: () => ({ host: "localhost", port: 6379 }) }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ startHeartbeatInterval: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("./launch-copy-provider", () => ({
  generateLaunchCopy: mocks.generate,
  LaunchCopyError: class extends Error {},
}));
vi.mock("@/lib/workers/budget", () => ({
  validateJobCost: vi.fn(), checkBudget: vi.fn(), releaseBudget: vi.fn(),
  BudgetExceededError: class extends Error {}, JobCostExceededError: class extends Error {},
}));
vi.mock("bullmq", () => ({
  Worker: class {
    constructor(_queue: string, processor: typeof mocks.processor) { mocks.processor = processor; }
    on() { return this; }
  },
  UnrecoverableError: class extends Error {},
}));

const plan = {
  id: "plan", book_id: "book", author_id: "author", template: "engagement",
  start_date: "2026-09-14", duration_weeks: 1,
  weekly_schedule: { mon: ["instagram"], wed: ["instagram"] },
  channels: ["instagram"], languages: ["sv"], content_types: ["text"],
};
type StoredPost = { scheduled_for: string; channel: string; language: string; content_type: string; caption: string; status: string };
let posts: StoredPost[];
let updates: Array<Record<string, unknown>>;
let readError = false;
let bookOwner = "author";
const processPlan = () => mocks.processor!({ name: "marketing-generate", id: "job", data: {
  bookId: "book", authorId: "author", channels: ["instagram"], language: "sv", campaignPlanId: "plan",
} });

describe("campaign worker", () => {
  const listeners: Array<[string, (...args: unknown[]) => void]> = [];
  beforeAll(async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379");
    const on = vi.spyOn(process, "on").mockImplementation(((event: string, listener: (...args: unknown[]) => void) => {
      listeners.push([event, listener]);
      return process;
    }) as typeof process.on);
    await import("../../../scripts/marketing-worker");
    on.mockRestore();
  });
  afterAll(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    posts = [];
    updates = [];
    readError = false;
    bookOwner = "author";
    mocks.generate.mockImplementation(async (input) => ({ headline: input.title, body: `Utkast för dag ${input.campaign?.day ?? 1}`, hashtags: "#bok", cta: "Upptäck boken" }));
    mocks.from.mockImplementation((table: string) => {
      let operation = "select";
      let value: unknown;
      const result = () => {
        if (table === "books") return { data: { id: "book", title: "Ocean", description: "A family crosses the sea.", author_id: bookOwner }, error: null };
        if (table === "marketing_campaign_plans") {
          if (operation === "update") updates.push(value as Record<string, unknown>);
          return { data: plan, error: null };
        }
        if (operation === "insert" || operation === "upsert") {
          posts.push(...(Array.isArray(value) ? value : [value]) as StoredPost[]);
          return { error: null };
        }
        return { data: [...posts], count: posts.length, error: readError ? { message: "Database unavailable" } : null };
      };
      const query = {
        select: () => query, eq: () => query, range: () => query, order: () => query,
        insert: (row: unknown) => { operation = "insert"; value = row; return query; },
        upsert: (row: unknown) => { operation = "upsert"; value = row; return query; },
        update: (row: unknown) => { operation = "update"; value = row; return query; },
        single: async () => result(), maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    });
  });

  it("generates language/channel-aware drafts with different day briefs and book facts", async () => {
    await processPlan();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    expect(mocks.generate.mock.calls[0][0]).toMatchObject({
      language: "sv", channel: "instagram", description: "A family crosses the sea.",
      campaign: { goal: "engagement", day: 1, scheduledFor: "2026-09-14" },
    });
    expect(mocks.generate.mock.calls[1][0].campaign).toMatchObject({ day: 3, scheduledFor: "2026-09-16" });
    expect(posts.map((post) => post.status)).toEqual(["draft", "draft"]);
    expect(new Set(posts.map((post) => post.caption)).size).toBe(2);
    expect(updates.at(-1)?.status).toBe("active");
  });

  it("refuses a plan whose book no longer belongs to its author", async () => {
    bookOwner = "someone-else";
    await expect(processPlan()).rejects.toThrow("Ownership mismatch");
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(posts).toHaveLength(0);
  });

  it("marks failed AI generation as failed without inserting a falsely ready post", async () => {
    mocks.generate.mockRejectedValue(new Error("MARKETING_AI_FAILED"));
    await expect(processPlan()).rejects.toThrow("MARKETING_AI_FAILED");
    expect(posts).toEqual([]);
    expect(updates.at(-1)).toMatchObject({ status: "failed" });
    expect(updates.some((update) => update.status === "active")).toBe(false);
  });

  it("resumes a partial plan without replacing an edited or approved post", async () => {
    posts.push({ scheduled_for: "2026-09-14T11:00:00+00:00", channel: "instagram", language: "sv", content_type: "text", caption: "Author edited", status: "ready" });
    await processPlan();
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ caption: "Author edited", status: "ready" });
    expect(posts[1].status).toBe("draft");
  });

  it("fails a post lookup error rather than treating the schedule as empty", async () => {
    readError = true;
    await expect(processPlan()).rejects.toThrow();
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(posts).toHaveLength(0);
  });

  it("rejects repeated provider copy instead of filling the calendar with identical posts", async () => {
    mocks.generate.mockResolvedValue({ headline: "Ocean", body: "Identical body", hashtags: "#bok", cta: "Read" });
    await expect(processPlan()).rejects.toThrow();
    expect(posts).toHaveLength(1);
    expect(updates.at(-1)?.status).toBe("failed");
  });
});
