import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredBudget = {
  value: number;
  expiresAtMs: number | null;
};

const { redisStore } = vi.hoisted(() => ({
  redisStore: new Map<string, StoredBudget>(),
}));

vi.mock("ioredis", () => ({
  default: class MockRedis {
    constructor() {}

    private readCurrent(key: string): number {
      const entry = redisStore.get(key);
      if (!entry) return 0;
      if (entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
        redisStore.delete(key);
        return 0;
      }
      return entry.value;
    }

    async eval(
      _script: string,
      _numberOfKeys: number,
      key: string,
      incrementRaw: string,
      limitRaw: string,
      ttlRaw: string
    ): Promise<[number, number]> {
      const increment = Math.max(0, Math.floor(Number(incrementRaw)));
      const limit = Math.max(0, Math.floor(Number(limitRaw)));
      const ttlSeconds = Math.max(1, Math.floor(Number(ttlRaw)));
      const current = this.readCurrent(key);

      if (current + increment > limit) {
        return [0, current];
      }

      const next = current + increment;
      const existing = redisStore.get(key);
      redisStore.set(key, {
        value: next,
        expiresAtMs: existing?.expiresAtMs ?? Date.now() + ttlSeconds * 1000,
      });
      return [1, next];
    }

    async get(key: string): Promise<string | null> {
      const current = this.readCurrent(key);
      if (current <= 0 && !redisStore.has(key)) return null;
      return String(current);
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
