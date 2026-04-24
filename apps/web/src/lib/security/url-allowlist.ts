/**
 * URL allow-list helper for user-supplied URLs that will be forwarded to a
 * third-party AI provider (Higgsfield, video-stitching pipeline, etc.).
 *
 * Attack surface: an authenticated user can set `books.cover_image` or supply
 * `imageUrl` in a request body. If that URL is passed to a provider that
 * follows redirects or proxies content, it becomes an SSRF vector — an
 * attacker points at `http://169.254.169.254/` / internal hostnames and
 * hopes the provider's response leaks the content.
 *
 * Policy: only https URLs whose host is explicitly allow-listed. The
 * Supabase Storage host is derived from `NEXT_PUBLIC_SUPABASE_URL`; additional
 * public CDNs can be added via `AI_IMAGE_URL_EXTRA_HOSTS` (comma-separated).
 */

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

function isPrivateIpv4(host: string): boolean {
  // Block the common IaaS metadata host and typical private ranges.
  if (host === "169.254.169.254") return true;
  if (host === "127.0.0.1" || host === "0.0.0.0" || host === "localhost") return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function getSupabaseStorageHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return normalizeHost(new URL(raw).host);
  } catch {
    return null;
  }
}

function getExtraAllowedHosts(): string[] {
  const raw = process.env.AI_IMAGE_URL_EXTRA_HOSTS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((host) => normalizeHost(host))
    .filter((host) => host.length > 0);
}

export type AllowlistOutcome =
  | { ok: true; url: URL }
  | { ok: false; reason: "invalid_url" | "not_https" | "blocked_host" };

/**
 * Validate a URL supplied by an authenticated user (or stored in a user-
 * writable column) before sending it to an outbound AI provider.
 */
export function validateProviderImageUrl(candidate: unknown): AllowlistOutcome {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return { ok: false, reason: "invalid_url" };
  }

  let url: URL;
  try {
    url = new URL(candidate.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "not_https" };
  }

  const host = normalizeHost(url.hostname);
  if (!host || isPrivateIpv4(host)) {
    return { ok: false, reason: "blocked_host" };
  }

  const allowed: string[] = [];
  const supabaseHost = getSupabaseStorageHost();
  if (supabaseHost) allowed.push(supabaseHost);
  for (const extra of getExtraAllowedHosts()) allowed.push(extra);

  const allow = allowed.some(
    (entry) => host === entry || host.endsWith(`.${entry}`)
  );
  if (!allow) {
    return { ok: false, reason: "blocked_host" };
  }

  return { ok: true, url };
}
