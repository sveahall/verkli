import { describe, it, expect, beforeEach, vi } from "vitest";

// Force in-memory rate limiter (no Redis) so _reset() and window expiry work deterministically
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    getRedisUrl: () => null,
    getRedisConnectionOptions: () => undefined,
    getRedisClientOptions: () => undefined,
  };
});

import { createPerUserRateLimiter } from "./rate-limit";

describe("createPerUserRateLimiter", () => {
  let limiter: ReturnType<typeof createPerUserRateLimiter>;

  beforeEach(() => {
    limiter = createPerUserRateLimiter({ maxPerMinute: 3 });
  });

  it("allows requests up to the limit", async () => {
    expect((await limiter.check("u1")).allowed).toBe(true);
    expect((await limiter.check("u1")).allowed).toBe(true);
    expect((await limiter.check("u1")).allowed).toBe(true);
  });

  it("blocks after exceeding the limit", async () => {
    await limiter.check("u1");
    await limiter.check("u1");
    await limiter.check("u1");
    const result = await limiter.check("u1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks users independently", async () => {
    // Exhaust user A
    await limiter.check("a");
    await limiter.check("a");
    await limiter.check("a");
    expect((await limiter.check("a")).allowed).toBe(false);

    // User B still has quota
    expect((await limiter.check("b")).allowed).toBe(true);
  });

  it("_reset clears all entries", async () => {
    await limiter.check("u1");
    await limiter.check("u1");
    await limiter.check("u1");
    expect((await limiter.check("u1")).allowed).toBe(false);

    limiter._reset();
    expect((await limiter.check("u1")).allowed).toBe(true);
  });

  it("refills after window expires", async () => {
    const fast = createPerUserRateLimiter({
      maxPerMinute: 2,
      windowMs: 50,
    });

    await fast.check("u1");
    await fast.check("u1");
    expect((await fast.check("u1")).allowed).toBe(false);

    // Wait for window to expire
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 60);
    });
    expect((await fast.check("u1")).allowed).toBe(true);
  });
});
