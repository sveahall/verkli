import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BudgetExceededError, JobCostExceededError } from "@/lib/workers/budget";
import { refundVideoBudget, reserveVideoBudget } from "./video-budget";

const { checkBudget, releaseBudget, validateJobCost } = vi.hoisted(() => ({
  checkBudget: vi.fn(),
  releaseBudget: vi.fn(),
  validateJobCost: vi.fn(),
}));
vi.mock("@/lib/workers/budget", async (original) => ({
  ...(await original<object>()),
  checkBudget,
  releaseBudget,
  validateJobCost,
}));

describe("reserveVideoBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkBudget.mockResolvedValue({});
  });
  afterEach(() => vi.restoreAllMocks());

  it("reserves against the video pipeline and returns a refundable reservation", async () => {
    const result = await reserveVideoBudget({ userId: "user-1", units: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.units).toBe(3);
    expect(result.reservation.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(validateJobCost).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", pipeline: "video", jobSize: 3 })
    );
    expect(checkBudget).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", pipeline: "video", units: 3 })
    );
    // Reservation and refund must address the same job for the refund to land.
    expect(validateJobCost.mock.calls[0][0].jobId).toBe(result.reservation.jobId);
    expect(checkBudget.mock.calls[0][0].jobId).toBe(result.reservation.jobId);
  });

  it("never reserves less than one unit", async () => {
    await reserveVideoBudget({ userId: "user-1", units: 0 });
    expect(checkBudget).toHaveBeenCalledWith(expect.objectContaining({ units: 1 }));
  });

  it("refuses an oversized job with 413 and does not reach the daily budget", async () => {
    validateJobCost.mockImplementation(() => {
      throw new JobCostExceededError({
        userId: "user-1",
        pipeline: "video",
        jobSize: 99,
        cap: 5,
        unit: "units",
        jobId: "job-1",
      });
    });
    const result = await reserveVideoBudget({ userId: "user-1", units: 99 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(413);
    expect(checkBudget).not.toHaveBeenCalled();
  });

  it("refuses an exhausted daily budget with 429", async () => {
    checkBudget.mockRejectedValue(
      new BudgetExceededError({
        userId: "user-1",
        pipeline: "video",
        day: "2026-09-21",
        key: "budget:video:user-1:2026-09-21",
        current: 100,
        limit: 100,
        jobId: "job-1",
      })
    );
    const result = await reserveVideoBudget({ userId: "user-1", units: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(429);
    const body = await result.response.json();
    // The raw error message embeds the user id and the Redis key; neither may
    // reach the client.
    expect(JSON.stringify(body)).not.toContain("user-1");
    expect(JSON.stringify(body)).not.toContain("budget:video");
  });

  it("rethrows unexpected failures rather than silently letting spend through", async () => {
    checkBudget.mockRejectedValue(new Error("redis unreachable"));
    await expect(reserveVideoBudget({ userId: "user-1", units: 1 })).rejects.toThrow(
      "redis unreachable"
    );
  });
});

describe("refundVideoBudget", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refunds the exact reservation", async () => {
    await refundVideoBudget({ jobId: "job-1", units: 2 });
    expect(releaseBudget).toHaveBeenCalledWith({ pipeline: "video", jobId: "job-1" });
  });

  it("swallows refund failures so they cannot mask the original error", async () => {
    releaseBudget.mockRejectedValue(new Error("redis down"));
    await expect(refundVideoBudget({ jobId: "job-1", units: 1 })).resolves.toBeUndefined();
  });
});
