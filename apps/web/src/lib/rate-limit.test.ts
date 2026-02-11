import { describe, it, expect, beforeEach } from "vitest";
import { createPerUserRateLimiter } from "./rate-limit";

describe("createPerUserRateLimiter", () => {
  let limiter: ReturnType<typeof createPerUserRateLimiter>;

  beforeEach(() => {
    limiter = createPerUserRateLimiter({ maxPerMinute: 3 });
  });

  it("allows requests up to the limit", () => {
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(true);
    expect(limiter.check("u1").allowed).toBe(true);
  });

  it("blocks after exceeding the limit", () => {
    limiter.check("u1");
    limiter.check("u1");
    limiter.check("u1");
    const result = limiter.check("u1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks users independently", () => {
    // Exhaust user A
    limiter.check("a");
    limiter.check("a");
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);

    // User B still has quota
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("_reset clears all entries", () => {
    limiter.check("u1");
    limiter.check("u1");
    limiter.check("u1");
    expect(limiter.check("u1").allowed).toBe(false);

    limiter._reset();
    expect(limiter.check("u1").allowed).toBe(true);
  });

  it("refills after window expires", () => {
    const fast = createPerUserRateLimiter({
      maxPerMinute: 2,
      windowMs: 50,
    });

    fast.check("u1");
    fast.check("u1");
    expect(fast.check("u1").allowed).toBe(false);

    // Wait for window to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(fast.check("u1").allowed).toBe(true);
        resolve();
      }, 60);
    });
  });
});
