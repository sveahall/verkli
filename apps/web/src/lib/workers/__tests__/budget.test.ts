import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredBudget = {
  // Redis stores strings; day-budget keys hold numeric strings, reservation
  // markers hold "<amount>|<dayKey>". We keep everything as a string to mirror
  // real Redis and support both the plain and idempotent budget scripts.
  value: string;
  expiresAtMs: number | null;
};

const { redisStore } = vi.hoisted(() => ({
  redisStore: new Map<string, StoredBudget>(),
}));

vi.mock("ioredis", () => ({
  default: class MockRedis {
    constructor() {}

    private readRaw(key: string): string | null {
      const entry = redisStore.get(key);
      if (!entry) return null;
      if (entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
        redisStore.delete(key);
        return null;
      }
      return entry.value;
    }

    private readCurrent(key: string): number {
      const raw = this.readRaw(key);
      return raw === null ? 0 : Number(raw);
    }

    private writeKeepTtl(key: string, value: string | number): void {
      const existing = redisStore.get(key);
      redisStore.set(key, {
        value: String(value),
        expiresAtMs: existing?.expiresAtMs ?? null,
      });
    }

    private writeWithTtl(key: string, value: string | number, ttlSeconds: number): void {
      const existing = redisStore.get(key);
      redisStore.set(key, {
        value: String(value),
        // Mirror the Lua `if TTL(key) < 0 then EXPIRE`: only set expiry if absent.
        expiresAtMs: existing?.expiresAtMs ?? Date.now() + ttlSeconds * 1000,
      });
    }

    async eval(
      _script: string,
      numberOfKeys: number,
      ...args: string[]
    ): Promise<[number, number] | [number, number, number] | number> {
      // Idempotent reserve: KEYS[1]=day key, KEYS[2]=marker; ARGV inc, limit, ttl.
      if (numberOfKeys === 2) {
        const [key, marker, incRaw, limRaw, ttlRaw] = args;
        const increment = Math.max(0, Math.floor(Number(incRaw)));
        const limit = Math.max(0, Math.floor(Number(limRaw)));
        const ttlSeconds = Math.max(1, Math.floor(Number(ttlRaw)));
        if (this.readRaw(marker) !== null) {
          return [1, this.readCurrent(key), 1];
        }
        const current = this.readCurrent(key);
        if (current + increment > limit) return [0, current, 0];
        const next = current + increment;
        this.writeWithTtl(key, next, ttlSeconds);
        redisStore.set(marker, {
          value: `${increment}|${key}`,
          expiresAtMs: Date.now() + ttlSeconds * 1000,
        });
        return [1, next, 0];
      }

      // Release: KEYS[1]=marker only, no ARGV.
      if (numberOfKeys === 1 && args.length === 1) {
        const [marker] = args;
        const raw = this.readRaw(marker);
        if (raw === null) return 0;
        const sep = raw.indexOf("|");
        if (sep < 0) {
          redisStore.delete(marker);
          return 0;
        }
        const amount = Number(raw.slice(0, sep));
        const daykey = raw.slice(sep + 1);
        if (amount > 0 && this.readRaw(daykey) !== null) {
          const next = this.readCurrent(daykey) - amount;
          this.writeKeepTtl(daykey, next < 0 ? 0 : next);
        }
        redisStore.delete(marker);
        return Number.isFinite(amount) ? amount : 0;
      }

      // Plain reserve: KEYS[1]=day key; ARGV inc, limit, ttl.
      const [key, incRaw, limRaw, ttlRaw] = args;
      const increment = Math.max(0, Math.floor(Number(incRaw)));
      const limit = Math.max(0, Math.floor(Number(limRaw)));
      const ttlSeconds = Math.max(1, Math.floor(Number(ttlRaw)));
      const current = this.readCurrent(key);
      if (current + increment > limit) return [0, current];
      const next = current + increment;
      this.writeWithTtl(key, next, ttlSeconds);
      return [1, next];
    }

    async get(key: string): Promise<string | null> {
      return this.readRaw(key);
    }

    async del(...keys: string[]): Promise<number> {
      let removed = 0;
      for (const key of keys) {
        if (redisStore.delete(key)) {
          removed++;
        }
      }
      return removed;
    }
  },
}));

import {
  checkBudget,
  releaseBudget,
  getUsage,
  resetAllBudgets,
  BudgetExceededError,
  JobCostExceededError,
  validateJobCost,
} from "../budget";

describe("workers/budget (redis)", () => {
  beforeEach(async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.TTS_DAILY_BUDGET = "5";
    process.env.TRANSLATION_DAILY_BUDGET = "10";
    process.env.VIDEO_DAILY_BUDGET = "3";
    delete process.env.TTS_JOB_CAP_CHARS;
    delete process.env.TRANSLATION_JOB_CAP_CHARS;
    delete process.env.VIDEO_JOB_CAP_UNITS;
    redisStore.clear();
    await resetAllBudgets();
  });

  it("does not double-charge when the same jobId is reserved again (retry)", async () => {
    // A BullMQ retry re-runs the processor and calls checkBudget again with the
    // SAME jobId. The reservation must be idempotent so a retried job is only
    // charged once (previously each attempt re-incremented the daily budget).
    await checkBudget({ userId: "user-1", pipeline: "translation", units: 4, jobId: "job-retry" });
    await checkBudget({ userId: "user-1", pipeline: "translation", units: 4, jobId: "job-retry" });
    await checkBudget({ userId: "user-1", pipeline: "translation", units: 4, jobId: "job-retry" });
    const usage = await getUsage({ userId: "user-1", pipeline: "translation" });
    expect(usage.current).toBe(4);
  });

  it("releaseBudget refunds a reservation so a failed job frees the allowance", async () => {
    await checkBudget({ userId: "user-1", pipeline: "translation", units: 6, jobId: "job-fail" });
    let usage = await getUsage({ userId: "user-1", pipeline: "translation" });
    expect(usage.current).toBe(6);

    const refunded = await releaseBudget({ pipeline: "translation", jobId: "job-fail" });
    expect(refunded).toBe(6);
    usage = await getUsage({ userId: "user-1", pipeline: "translation" });
    expect(usage.current).toBe(0);

    // Idempotent: a second release is a no-op.
    expect(await releaseBudget({ pipeline: "translation", jobId: "job-fail" })).toBe(0);

    // After a refund the same job can reserve again (a genuine retry).
    await checkBudget({ userId: "user-1", pipeline: "translation", units: 6, jobId: "job-fail" });
    usage = await getUsage({ userId: "user-1", pipeline: "translation" });
    expect(usage.current).toBe(6);
  });

  it("reserves budget per user and pipeline", async () => {
    await checkBudget({ userId: "user-1", pipeline: "translation", units: 4, jobId: "job-1" });
    const usage = await getUsage({ userId: "user-1", pipeline: "translation" });
    expect(usage.current).toBe(4);
    expect(usage.limit).toBe(10);
  });

  it("isolates counters per pipeline for same user", async () => {
    await checkBudget({ userId: "user-1", pipeline: "translation", units: 4, jobId: "job-1" });
    await checkBudget({ userId: "user-1", pipeline: "tts", units: 2, jobId: "job-2" });

    const translationUsage = await getUsage({ userId: "user-1", pipeline: "translation" });
    const ttsUsage = await getUsage({ userId: "user-1", pipeline: "tts" });
    expect(translationUsage.current).toBe(4);
    expect(ttsUsage.current).toBe(2);
  });

  it("isolates counters per user for same pipeline", async () => {
    await checkBudget({ userId: "user-1", pipeline: "video", units: 1, jobId: "job-1" });
    await checkBudget({ userId: "user-2", pipeline: "video", units: 2, jobId: "job-2" });

    const usage1 = await getUsage({ userId: "user-1", pipeline: "video" });
    const usage2 = await getUsage({ userId: "user-2", pipeline: "video" });
    expect(usage1.current).toBe(1);
    expect(usage2.current).toBe(2);
  });

  it("uses UTC day suffix in keys", async () => {
    const beforeMidnight = new Date("2026-03-04T23:59:59.000Z");
    const afterMidnight = new Date("2026-03-05T00:00:01.000Z");

    const usageA = await checkBudget({
      userId: "user-1",
      pipeline: "translation",
      units: 2,
      jobId: "job-a",
      now: beforeMidnight,
    });
    const usageB = await checkBudget({
      userId: "user-1",
      pipeline: "translation",
      units: 2,
      jobId: "job-b",
      now: afterMidnight,
    });

    expect(usageA.day).toBe("2026-03-04");
    expect(usageB.day).toBe("2026-03-05");
    expect(usageA.key).not.toBe(usageB.key);
  });

  it("rejects when daily budget is exceeded (worker path: translation)", async () => {
    process.env.TRANSLATION_DAILY_BUDGET = "3";

    await checkBudget({
      userId: "author-1",
      pipeline: "translation",
      units: 3,
      jobId: "translation-job-1",
    });

    await expect(
      checkBudget({
        userId: "author-1",
        pipeline: "translation",
        units: 1,
        jobId: "translation-job-2",
      })
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("rejects oversized single jobs before budget reservation", () => {
    process.env.TRANSLATION_JOB_CAP_CHARS = "10";
    process.env.TTS_JOB_CAP_CHARS = "12";
    process.env.VIDEO_JOB_CAP_UNITS = "2";

    expect(() =>
      validateJobCost({
        userId: "author-1",
        pipeline: "translation",
        jobSize: 11,
        jobId: "translation-job-3",
      })
    ).toThrow(JobCostExceededError);

    expect(() =>
      validateJobCost({
        userId: "author-1",
        pipeline: "tts",
        jobSize: 13,
        jobId: "tts-job-1",
      })
    ).toThrow(JobCostExceededError);

    expect(() =>
      validateJobCost({
        userId: "author-1",
        pipeline: "video",
        jobSize: 3,
        jobId: "video-job-1",
      })
    ).toThrow(JobCostExceededError);
  });
});
