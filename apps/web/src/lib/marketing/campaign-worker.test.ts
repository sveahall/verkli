import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processor: null as null | ((job: unknown) => Promise<void>),
  generate: vi.fn(),
  from: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../../scripts/load-dotenv", () => ({}));
vi.mock("../../../scripts/sentry-worker-init", () => ({ Sentry: { captureException: vi.fn() } }));
vi.mock("@/lib/env", () => ({ assertServerEnv: vi.fn(), getRedisConnectionOptions: () => ({ host: "localhost", port: 6379 }) }));
vi.mock("@/lib/health/worker-heartbeat", () => ({ startHeartbeatInterval: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: mocks.create }; } }));
vi.mock("./launch-copy-provider", async original => ({ ...await original<object>(), generateLaunchCopy: mocks.generate }));
// The usage meter writes to `usage_events` through the same admin client this
// test mocks, so without stubbing it every metered call lands in the same
// capture array as the campaign posts and the counts below go wrong. The meter
// has its own tests; here it is noise.
vi.mock("@/lib/usage/meter", () => ({ recordUsage: vi.fn() }));
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
import { UnrecoverableError } from "bullmq";
import { validateJobCost, JobCostExceededError } from "@/lib/workers/budget";
import type { MarketingJobData } from "@/lib/marketing-queue";

type StoredPost = { scheduled_for: string; channel: string; language: string; content_type: string; caption: string; status: string };
let posts: StoredPost[];
let updates: Array<Record<string, unknown>>;
let readError = false;
let bookOwner = "author";
let receiptWriteError = false;
let jobData: MarketingJobData;
let receipts: Array<{ id: string; input: { draftId: string } }>;
const persistJob = vi.fn(async (data: MarketingJobData) => { jobData = structuredClone(data); });
const processPlan = () => mocks.processor!({ name: "marketing-generate", id: "job", data: structuredClone(jobData), updateData: persistJob });

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
    jobData = { bookId: "book", authorId: "author", channels: ["instagram"], language: "sv", campaignPlanId: "plan" };
    receipts = [];
    persistJob.mockImplementation(async data => { jobData = structuredClone(data); });
    vi.mocked(validateJobCost).mockReturnValue({} as ReturnType<typeof validateJobCost>);
    vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
    vi.stubEnv("NVIDIA_NIM_API_KEY", "");
    vi.stubEnv("AI_CRITIC_ENABLED", "false");
    posts = [];
    updates = [];
    readError = false;
    bookOwner = "author";
    receiptWriteError = false;
    mocks.generate.mockImplementation(async (input) => ({ headline: input.title, body: `Utkast för dag ${input.campaign?.day ?? 1}`, hashtags: "#bok", cta: "Upptäck boken" }));
    mocks.from.mockImplementation((table: string) => {
      let operation = "select";
      let value: unknown;
      const result = () => {
        if (table === "ai_jobs") {
          if (operation === "insert") receipts.push(value as typeof receipts[number]);
          return { data: { id: "receipt" }, error: operation === "update" && receiptWriteError ? { message: "receipt storage unavailable" } : null };
        }
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
  it("builds a four-week multilingual draft calendar without approving or posting", async () => {
    plan.duration_weeks = 4;
    plan.languages = ["sv", "en"];
    try {
      await processPlan();
      expect(posts).toHaveLength(16);
      expect(new Set(posts.map(post => post.scheduled_for)).size).toBe(8);
      expect(new Set(posts.map(post => post.language))).toEqual(new Set(["sv", "en"]));
      expect(posts.every(post => post.status === "draft")).toBe(true);
      expect(mocks.generate.mock.calls.at(-1)?.[0].campaign.day).toBe(24);
    } finally {
      plan.duration_weeks = 1;
      plan.languages = ["sv"];
    }
  });

  async function useRealGeneration(cap: number) {
    const actual = await vi.importActual<typeof import("./launch-copy-provider")>("./launch-copy-provider");
    mocks.generate.mockImplementation(actual.generateLaunchCopy);
    posts.push({ scheduled_for: "2026-09-14T11:00:00+00:00", channel: "instagram", language: "sv", content_type: "text", caption: "Already saved body", status: "ready" });
    vi.mocked(validateJobCost).mockImplementation(input => {
      if (input.pipeline === "marketing" && input.jobSize > cap) throw new JobCostExceededError({ userId: "author", pipeline: "marketing", jobSize: input.jobSize, cap, unit: "units", jobId: null });
      return {} as ReturnType<typeof validateJobCost>;
    });
    mocks.create.mockImplementation(async () => ({ id: "response", model: "actual-model", usage: { input_tokens: 20, output_tokens: 10 }, content: [{ type: "text", text: JSON.stringify({ headline: "Ocean", body: mocks.create.mock.calls.length === 1 ? "Already saved body" : "A fresh unique draft", hashtags: "#bok", cta: "Read" }) }] }));
  }

  it("shares the real model budget across the worker's repeated-copy attempt", async () => {
    await useRealGeneration(12000);
    await expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.create).toHaveBeenCalledOnce();
    const sizes = vi.mocked(validateJobCost).mock.calls.map(([input]) => input).filter(input => input.pipeline === "marketing").map(input => input.jobSize);
    expect(sizes).toHaveLength(2);
    expect(sizes[0]).toBeLessThan(12000);
    expect(sizes[1]).toBe(sizes[0] * 2);
    expect(posts).toHaveLength(1);
    await expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("keeps separate receipts under one draft scope when the cap permits reprompting", async () => {
    await useRealGeneration(30000);
    await processPlan();
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(receipts).toHaveLength(2);
    expect(new Set(receipts.map(row => row.id)).size).toBe(2);
    expect(new Set(receipts.map(row => row.input.draftId)).size).toBe(1);
    expect(posts).toHaveLength(2);
    expect(jobData.modelWorkPending).toBeNull();
  });

  it("does not dispatch before the queue checkpoint is persisted", async () => {
    persistJob.mockRejectedValueOnce(new Error("queue storage unavailable"));
    await expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("stops a restarted attempt when paid outcome is unknown", async () => {
    await useRealGeneration(30000);
    mocks.create.mockRejectedValue(new Error("provider timeout"));
    await expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(jobData.modelWorkPending).toBeTruthy();
    await expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(receipts).toHaveLength(1);
  });

  it("never repeats paid work after receipt persistence fails", async () => {
    await useRealGeneration(30000);
    receiptWriteError = true;
    await expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(jobData.modelWorkPending).toBeTruthy();
    await expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(receipts).toHaveLength(1);
    expect(posts).toHaveLength(1);
  });

  it("blocks a recovered job whose provider invocation never returned", async () => {
    await useRealGeneration(30000);
    let rejectCall!: (error: Error) => void;
    let started!: () => void;
    const callStarted = new Promise<void>(resolve => { started = resolve; });
    mocks.create.mockImplementation(() => new Promise((_resolve, reject) => { rejectCall = reject; started(); }));
    const originalAttempt = expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    await callStarted;
    await expect(processPlan()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.create).toHaveBeenCalledOnce();
    rejectCall(new Error("original connection closed"));
    await originalAttempt;
  });

});
