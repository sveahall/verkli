/**
 * Resolve the client IP for rate-limiting / abuse-tracking purposes.
 *
 * On Vercel the platform sets `x-forwarded-for` to a trusted left-most client
 * IP, so taking the first entry is correct. Behind a different proxy chain
 * the right answer depends on `TRUSTED_PROXY_HOPS` (number of hops to skip
 * from the right). Default is 0 (no trusted hops) → use the left-most entry.
 */
export function getClientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const trustedHops = Number.parseInt(
        process.env.TRUSTED_PROXY_HOPS ?? "0",
        10,
      );
      if (Number.isFinite(trustedHops) && trustedHops > 0) {
        const idx = Math.max(0, parts.length - 1 - trustedHops);
        return parts[idx] ?? parts[0];
      }
      return parts[0];
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}
