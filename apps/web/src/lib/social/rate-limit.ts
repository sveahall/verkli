import { createPerUserRateLimiter } from "@/lib/rate-limit";

const connectLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });
const publishLimiter = createPerUserRateLimiter({ maxPerMinute: 5 });

export async function checkConnectRateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  return connectLimiter.check(userId);
}

export async function checkPublishRateLimit(userId: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  return publishLimiter.check(userId);
}

export function resetSocialRateLimits() {
  connectLimiter._reset();
  publishLimiter._reset();
}
