const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_PER_MINUTE = 5;

type RateLimitEntry = { tokens: number; lastRefill: number };
const rateLimitMap = new Map<string, RateLimitEntry>();

export function resetRateLimits() {
  rateLimitMap.clear();
}

export function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const existing = rateLimitMap.get(userId);
  if (!existing) {
    rateLimitMap.set(userId, { tokens: RATE_LIMIT_MAX_PER_MINUTE - 1, lastRefill: now });
    return { allowed: true };
  }
  const elapsed = now - existing.lastRefill;
  if (elapsed >= RATE_LIMIT_WINDOW_MS) {
    existing.tokens = RATE_LIMIT_MAX_PER_MINUTE - 1;
    existing.lastRefill = now;
    return { allowed: true };
  }
  if (existing.tokens <= 0) {
    return { allowed: false, retryAfterSeconds: Math.ceil((RATE_LIMIT_WINDOW_MS - elapsed) / 1000) };
  }
  existing.tokens -= 1;
  return { allowed: true };
}
