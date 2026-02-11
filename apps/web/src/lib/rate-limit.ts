/**
 * Shared per-user rate limiter (token bucket, in-memory).
 *
 * Usage:
 *   const limiter = createPerUserRateLimiter({ maxPerMinute: 5 });
 *   const result = limiter.check(userId);
 *   if (!result.allowed) return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: result.retryAfterSeconds });
 */

type RateLimitEntry = { tokens: number; lastRefill: number };

export function createPerUserRateLimiter(opts: {
  maxPerMinute: number;
  windowMs?: number;
}) {
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.maxPerMinute;
  const map = new Map<string, RateLimitEntry>();

  return {
    check(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
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
    },

    /** @internal for tests */
    _reset(): void {
      map.clear();
    },
  };
}
