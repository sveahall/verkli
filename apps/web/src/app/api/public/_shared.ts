import { createPerUserRateLimiter } from "@/lib/rate-limit";

/**
 * Public API rate limiter (per IP).
 * Generous: 60 requests/min. Tweak via overrides.
 *
 * Exported so tests can call `_reset()` between cases.
 */
export const publicApiRateLimiter = createPerUserRateLimiter({
  maxPerMinute: 60,
});

/**
 * Best-effort client IP extraction. Falls back to "anonymous" when no
 * forwarding header is present (local dev). Rate limiting still works because
 * the bucket is shared per identity and "anonymous" is a single bucket — fine
 * for dev. In prod, the platform sets `x-forwarded-for`.
 */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "anonymous";
}
