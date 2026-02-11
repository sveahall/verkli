import { createPerUserRateLimiter } from "@/lib/rate-limit";

const connectLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });
const publishLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

export function checkConnectRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  return connectLimiter.check(userId);
}

export function checkPublishRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  return publishLimiter.check(userId);
}

export function resetSocialRateLimits() {
  connectLimiter._reset();
  publishLimiter._reset();
}
