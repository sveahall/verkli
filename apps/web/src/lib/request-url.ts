/**
 * Canonical base-URL resolution for Stripe checkout and other outbound
 * redirects (success_url / cancel_url / return_url).
 *
 * Used by every checkout + billing-connect route, so a wrong value here strands
 * a *paying* customer on a dead page after payment. That is exactly what
 * happened once: `NEXT_PUBLIC_SITE_URL` pointed at a `*.vercel.app` alias whose
 * deployment had been removed, so Stripe redirected the buyer to a
 * `DEPLOYMENT_NOT_FOUND` 404 after a completed Apple Pay charge.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_URL` — but ONLY when it is a real custom domain. A
 *      `*.vercel.app` value is rejected: those aliases are tied to a specific
 *      deployment and can 404 the moment a new deploy supersedes them, which is
 *      never what you want for a post-payment redirect.
 *   2. The live host the request actually arrived on (`x-forwarded-host`, set by
 *      the platform proxy). This host is provably serving traffic right now —
 *      the buyer is on it — so redirecting back to it cannot 404.
 *   3. The request URL origin (local dev, no proxy headers).
 */
export function getRequestBaseUrl(request: Request): string {
  const configured = normalizeConfiguredUrl(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  if (host) {
    return `${proto || "https"}://${host}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Returns the configured site URL only when it is a usable canonical domain:
 * present, parseable, http(s), and NOT a `*.vercel.app` alias. Returns null
 * otherwise so the caller falls back to the live request host.
 */
function normalizeConfiguredUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  // Reject deployment-scoped Vercel aliases — they are not stable enough to be
  // the target of a redirect that happens minutes after a deploy.
  if (/\.vercel\.app$/i.test(parsed.host)) return null;

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}
