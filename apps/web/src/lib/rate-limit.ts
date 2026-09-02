/**
 * Shared per-user rate limiter (token bucket).
 *
 * In production with REDIS_URL: uses Redis for persistence across deploys.
 * Otherwise: in-memory fallback (resets on deploy).
 *
 * Usage:
 *   const limiter = createPerUserRateLimiter({ maxPerMinute: 5 });
 *   const result = await limiter.check(userId);
 *   if (!result.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: result.retryAfterSeconds });
 *
 * NOTE: check() returns a Promise now but resolves synchronously for in-memory mode,
 * so `await limiter.check(userId)` works in both modes. For backwards compat,
 * the return type is { allowed, retryAfterSeconds? } | Promise<{ allowed, retryAfterSeconds? }>.
 */

import Redis from "ioredis";
import { getRedisClientOptions } from "@/lib/env";

type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number };
type RateLimitEntry = { tokens: number; lastRefill: number };

/**
 * A rate-limit check is best-effort: it must never outlast the request it is
 * protecting. Two seconds is far above a healthy Redis round trip and far below
 * any platform function limit.
 */
const RATE_LIMIT_COMMAND_TIMEOUT_MS = 2_000;

let sharedRedis: Redis | null = null;
let redisChecked = false;

function getSharedRedis(): Redis | null {
  if (redisChecked) return sharedRedis;
  // enableOfflineQueue: false is what makes the in-memory fallback below real.
  //
  // Without it, ioredis queues commands issued while disconnected and replays
  // them when a connection appears. Against a Redis that actively refuses, that
  // is fine — the connection errors and the fallback runs. Against one that is
  // simply unreachable, the command waits forever: `connect()` is not awaited
  // here, the client is returned immediately, and `checkRedis` then awaits an
  // eval that never settles. The catch that falls back to in-memory can only
  // fire on a rejection, and a queued command does not reject.
  //
  // That is not theoretical. Cover generation on the production deployment hung
  // on exactly this line and was killed by the platform at 60s, with the route
  // logging "auth" and "demo-guard" and then nothing — the author saw a minute
  // of spinner and a generic failure, for a rate-limit check that is supposed
  // to be best-effort. 2026-09-02.
  //
  // commandTimeout covers the other shape: a host that accepts the connection
  // and then goes quiet.
  const connection = getRedisClientOptions({
    lazyConnect: true,
    enableOfflineQueue: false,
    commandTimeout: RATE_LIMIT_COMMAND_TIMEOUT_MS,
  });
  if (!connection) return null;

  try {
    redisChecked = true;
    sharedRedis = new Redis(connection);
    sharedRedis.on("error", () => {
      // Silent by design: the limiter falls back to in-memory, and a rate-limit
      // check must never be the reason a request fails.
    });
    sharedRedis.connect().catch(() => {
      sharedRedis?.disconnect();
      sharedRedis = null;
      redisChecked = false;
    });
    return sharedRedis;
  } catch {
    redisChecked = false;
    return null;
  }
}

export function createPerUserRateLimiter(opts: {
  maxPerMinute: number;
  windowMs?: number;
}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.maxPerMinute;
  const windowSec = Math.ceil(windowMs / 1000);

  // In-memory fallback
  const map = new Map<string, RateLimitEntry>();

  function checkInMemory(userId: string): RateLimitResult {
    const now = Date.now();
    const existing = map.get(userId);

    if (!existing) {
      map.set(userId, { tokens: max - 1, lastRefill: now });
      return { allowed: true };
    }

    const elapsed = now - existing.lastRefill;
    if (elapsed >= windowMs) {
      existing.tokens = max - 1;
      existing.lastRefill = now;
      return { allowed: true };
    }

    if (existing.tokens <= 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((windowMs - elapsed) / 1000),
      };
    }

    existing.tokens -= 1;
    return { allowed: true };
  }

  async function checkRedis(redis: Redis, userId: string): Promise<RateLimitResult> {
    const key = `rl:${userId}:${max}`;

    try {
      // Atomic INCR + EXPIRE via Lua script to avoid TOCTOU race condition.
      // If the process crashes between INCR and EXPIRE as separate commands,
      // the key would persist forever without a TTL.
      const current = (await redis.eval(
        `local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current`,
        1,
        key,
        windowSec
      )) as number;

      if (current > max) {
        const ttl = await redis.ttl(key);
        return {
          allowed: false,
          retryAfterSeconds: ttl > 0 ? ttl : windowSec,
        };
      }

      return { allowed: true };
    } catch {
      // Redis failure — fall back to in-memory
      return checkInMemory(userId);
    }
  }

  return {
    check(userId: string): RateLimitResult | Promise<RateLimitResult> {
      const redis = getSharedRedis();
      if (redis) {
        return checkRedis(redis, userId);
      }
      return checkInMemory(userId);
    },

    /** @internal for tests — clears in-memory state AND resets the shared Redis singleton */
    _reset(): void {
      map.clear();
      if (sharedRedis) {
        sharedRedis.disconnect();
        sharedRedis = null;
      }
      redisChecked = false;
    },
  };
}
