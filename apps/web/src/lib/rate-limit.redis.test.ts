import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The failure these guard: cover generation on production hung for 60 seconds
 * inside a rate-limit check and was killed by the platform. The route logged
 * "auth" and "demo-guard" and then nothing. 2026-09-02.
 *
 * The cause was ioredis's offline queue. `connect()` is not awaited, so the
 * client is handed to the caller immediately; against an unreachable host the
 * eval that follows is queued rather than rejected, and the catch that falls
 * back to in-memory only fires on a rejection. A best-effort check became an
 * indefinite wait.
 *
 * A rate limiter must never be the reason a request fails, so both properties
 * below are pinned: it asks for fail-fast options, and a Redis that errors
 * still lets the request through.
 */

const captured: { overrides: Record<string, unknown> | undefined } = {
  overrides: undefined,
};

const mocks = vi.hoisted(() => ({
  evalFn: vi.fn(),
  connectFn: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    constructor(public options: unknown) {}
    on() {}
    connect() {
      return mocks.connectFn();
    }
    disconnect() {}
    eval(...args: unknown[]) {
      return mocks.evalFn(...args);
    }
    ttl() {
      return Promise.resolve(30);
    }
  },
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    getRedisClientOptions: (overrides: Record<string, unknown>) => {
      captured.overrides = overrides;
      return { host: "127.0.0.1", port: 6379, ...overrides };
    },
  };
});

describe("rate limiter Redis client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.overrides = undefined;
    mocks.connectFn.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("asks for a client that cannot queue commands while disconnected", async () => {
    const { createPerUserRateLimiter } = await import("./rate-limit");
    const limiter = createPerUserRateLimiter({ maxPerMinute: 3 });
    mocks.evalFn.mockResolvedValue(1);

    await limiter.check("user-1");
    limiter._reset();

    expect(captured.overrides).toMatchObject({
      lazyConnect: true,
      enableOfflineQueue: false,
    });
  });

  it("bounds a single command so a silent host cannot stall the request", async () => {
    const { createPerUserRateLimiter } = await import("./rate-limit");
    const limiter = createPerUserRateLimiter({ maxPerMinute: 3 });
    mocks.evalFn.mockResolvedValue(1);

    await limiter.check("user-1");
    limiter._reset();

    const timeout = captured.overrides?.commandTimeout as number;
    expect(timeout).toBeGreaterThan(0);
    // Well under any platform function limit — a check must not outlast the
    // request it protects.
    expect(timeout).toBeLessThanOrEqual(5_000);
  });

  it("allows the request when the Redis command rejects", async () => {
    const { createPerUserRateLimiter } = await import("./rate-limit");
    const limiter = createPerUserRateLimiter({ maxPerMinute: 3 });
    // What enableOfflineQueue: false produces when disconnected.
    mocks.evalFn.mockRejectedValue(
      new Error("Stream isn't writeable and enableOfflineQueue options is false")
    );

    const result = await limiter.check("user-1");
    limiter._reset();

    expect(result.allowed).toBe(true);
  });

  it("still enforces the limit through the in-memory fallback", async () => {
    const { createPerUserRateLimiter } = await import("./rate-limit");
    const limiter = createPerUserRateLimiter({ maxPerMinute: 2 });
    mocks.evalFn.mockRejectedValue(new Error("redis down"));

    const first = await limiter.check("user-2");
    const second = await limiter.check("user-2");
    const third = await limiter.check("user-2");
    limiter._reset();

    expect([first.allowed, second.allowed]).toEqual([true, true]);
    // Falling back must not mean giving up: a broken Redis degrades the limiter
    // to per-instance counting, it does not disable it.
    expect(third.allowed).toBe(false);
  });
});
