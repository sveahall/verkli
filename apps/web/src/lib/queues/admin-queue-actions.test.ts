import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRedisConnectionOptions: vi.fn(),
  queueCtor: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ getRedisConnectionOptions: mocks.getRedisConnectionOptions }));
vi.mock("bullmq", () => ({
  Queue: class {
    constructor(name: string) {
      mocks.queueCtor(name);
    }
    getFailed = () => Promise.resolve(currentJobs);
    getJobCounts = () =>
      countsThrow
        ? Promise.reject(new Error("redis went away"))
        : Promise.resolve({ failed: remainingFailed });
    close = () => Promise.resolve();
  },
}));

let currentJobs: Array<{ id: string; retry: () => Promise<void> }> = [];
let remainingFailed = 0;
let countsThrow = false;

const { retryFailedJobs, isActionableQueue, RETRY_BATCH_MAX } = await import(
  "./admin-queue-actions"
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRedisConnectionOptions.mockReturnValue({ host: "localhost", port: 6379 });
  currentJobs = [];
  remainingFailed = 0;
  countsThrow = false;
});

describe("isActionableQueue", () => {
  it("accepts a known production queue", () => {
    expect(isActionableQueue("notifications")).toBe(true);
  });

  it("rejects anything not on the allowlist", () => {
    // `new Queue(name)` takes any string, so an unvalidated name would point
    // BullMQ at arbitrary keys in the shared Redis instance.
    expect(isActionableQueue("bull:something-else")).toBe(false);
    expect(isActionableQueue("")).toBe(false);
    expect(isActionableQueue(null)).toBe(false);
    expect(isActionableQueue(42)).toBe(false);
  });
});

describe("retryFailedJobs", () => {
  it("refuses an unknown queue without opening a connection", async () => {
    const result = await retryFailedJobs("not-a-queue");

    expect(result).toEqual({ ok: false, queueName: "not-a-queue", error: "UNKNOWN_QUEUE" });
    expect(mocks.queueCtor).not.toHaveBeenCalled();
  });

  it("reports the number that actually moved, not the batch size", async () => {
    // A job can refuse to retry — already retried elsewhere, or gone. Counting
    // the batch instead of the successes would be a lie the operator acts on.
    currentJobs = [
      { id: "1", retry: () => Promise.resolve() },
      { id: "2", retry: () => Promise.reject(new Error("already retried")) },
      { id: "3", retry: () => Promise.resolve() },
    ];
    remainingFailed = 1;

    const result = await retryFailedJobs("notifications");

    expect(result).toMatchObject({
      ok: true,
      retried: 2,
      failedToRetry: 1,
      remaining: 1,
    });
  });

  it("caps the batch so one call cannot time out mid-requeue", async () => {
    expect(RETRY_BATCH_MAX).toBe(50);
    const result = await retryFailedJobs("notifications", 10_000);
    expect(result.ok).toBe(true);
  });

  it("keeps confirmed retries when the follow-up count blows up", async () => {
    // Found by codex review. The count read happens AFTER the jobs have already
    // been requeued, so letting it fail the whole call would tell the operator
    // nothing moved about a queue that has in fact been mutated.
    currentJobs = [
      { id: "1", retry: () => Promise.resolve() },
      { id: "2", retry: () => Promise.resolve() },
    ];
    countsThrow = true;

    const result = await retryFailedJobs("notifications");

    expect(result).toMatchObject({ ok: true, retried: 2, remaining: null });
  });

  it("says so plainly when Redis is not configured", async () => {
    mocks.getRedisConnectionOptions.mockReturnValue(null);

    const result = await retryFailedJobs("notifications");

    expect(result).toMatchObject({ ok: false, error: "REDIS_URL not configured" });
  });
});
