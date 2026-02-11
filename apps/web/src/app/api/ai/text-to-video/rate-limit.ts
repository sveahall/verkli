import { createPerUserRateLimiter } from "@/lib/rate-limit";

const limiter = createPerUserRateLimiter({ maxPerMinute: 5 });

export function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  return limiter.check(userId);
}

export function resetRateLimits() {
  limiter._reset();
}
