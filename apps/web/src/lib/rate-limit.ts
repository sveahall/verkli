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

let sharedRedis: Redis | null = null;
let redisChecked = false;

function getSharedRedis(): Redis | null {
  if (redisChecked) return sharedRedis;
  const connection = getRedisClientOptions({ lazyConnect: true });
  if (!connection) return null;

  try {
    redisChecked = true;
    sharedRedis = new Redis(connection);
    sharedRedis.on("error", () => {
      // Silent by design: limiter falls back to in-memory when Redis is unavailable.
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
      const current = await redis.incr(key);

      if (current === 1) {
        // First request in window — set expiry
        await redis.expire(key, windowSec);
      }

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

    /** @internal for tests */
    _reset(): void {
      map.clear();
    },
  };
}
