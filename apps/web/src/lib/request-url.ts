/**
 * Canonical base-URL resolution for Stripe checkout and other outbound
 * redirects. Prefer `NEXT_PUBLIC_SITE_URL` when set; fall back to the
 * incoming request's origin.
 *
 * Previously duplicated in six checkout routes with identical bodies —
 * consolidated here so trimming/fallback rules can only drift in one place.
 */
export function getRequestBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.endsWith("/") ? fromEnv.slice(0, -1) : fromEnv;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}
