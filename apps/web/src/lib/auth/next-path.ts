/**
 * Post-sign-in redirect target (`?next=`) handling.
 *
 * The buy path sends unauthenticated buyers to
 * `/reader/signin?next=/reader/books/<id>`. Honouring that parameter is the
 * difference between a buyer landing back on the book they wanted and landing
 * on the home feed having to find it again.
 *
 * Because the value is attacker-controlled it MUST be validated before any
 * redirect: an unvalidated `next` is a textbook open redirect — a phishing link
 * that starts on our real, trusted sign-in page and ends on the attacker's.
 * The rule enforced here is: **same-origin relative paths only.**
 */

/**
 * Any origin works as long as it is one no real request can come from — the
 * only thing we assert is that resolving `next` against it does not *change*
 * the origin. WHATWG `URL` parsing normalises exactly like a browser
 * (backslashes become slashes, `//host` becomes protocol-relative), so this
 * catches the bypasses a hand-written string check misses.
 */
const PROBE_ORIGIN = "https://next-path.invalid";

const MAX_NEXT_PATH_LENGTH = 512;

/**
 * Characters a browser silently strips while parsing a URL. Left in place they
 * would let `"/\t/evil.com"` pass our check and then become `"//evil.com"`
 * by the time the navigation happens.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Sending someone back to an auth screen right after they authenticated is a
 * loop, so those destinations are dropped rather than honoured.
 */
const AUTH_PATH_PREFIXES = [
  "/reader/signin",
  "/reader/signup",
  "/reader/forgot-password",
  "/reader/reset-password",
  "/author/signin",
  "/author/signup",
  "/author/forgot-password",
  "/author/reset-password",
  "/auth/",
];

/** Cookie that carries `next` across an OAuth round trip. */
export const NEXT_PATH_COOKIE = "verkli_next";

/**
 * Validate an untrusted `next` value and return a safe same-origin path, or
 * `null` if it must not be used.
 *
 * Rejected: absolute URLs (`https://evil.com`), protocol-relative URLs
 * (`//evil.com`), the backslash variants a browser normalises into those
 * (`/\evil.com`, `/\/evil.com`), control characters, values not rooted at `/`,
 * over-long values, and auth routes (redirect loop).
 */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_NEXT_PATH_LENGTH) return null;
  if (CONTROL_CHARS.test(trimmed)) return null;

  // Percent-encoding can hide a second slash. Validate the decoded form too; a
  // malformed escape sequence is rejected outright rather than guessed at.
  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return null;
  }
  if (CONTROL_CHARS.test(decoded)) return null;

  for (const candidate of [trimmed, decoded]) {
    // Must be rooted at a single slash. This also rejects bare hosts
    // ("evil.com/x"), which would otherwise resolve to a same-origin path.
    if (!candidate.startsWith("/")) return null;
    if (candidate.startsWith("//") || candidate.startsWith("/\\")) return null;

    let resolved: URL;
    try {
      resolved = new URL(candidate, PROBE_ORIGIN);
    } catch {
      return null;
    }
    if (resolved.origin !== PROBE_ORIGIN) return null;
  }

  const url = new URL(trimmed, PROBE_ORIGIN);

  const lowered = url.pathname.toLowerCase();
  if (AUTH_PATH_PREFIXES.some((prefix) => lowered.startsWith(prefix))) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** Default destination when there is no usable `next`. */
export function defaultHomePathForRole(role: "author" | "reader" | null): string {
  if (role === "author") return "/author/home";
  if (role === "reader") return "/reader/home";
  return "/";
}

/** Resolve where to send someone after a successful sign-in. */
export function resolvePostSignInPath(
  rawNext: string | null | undefined,
  role: "author" | "reader" | null
): string {
  return sanitizeNextPath(rawNext) ?? defaultHomePathForRole(role);
}

/**
 * `Set-Cookie` value that carries `next` across an OAuth redirect.
 *
 * Supabase matches `redirectTo` against a configured allow-list, so appending a
 * query string to the callback URL risks the provider rejecting it in
 * production. A short-lived cookie keeps `redirectTo` byte-identical.
 * `SameSite=Lax` is sufficient because the OAuth return is a top-level GET.
 */
export function nextPathCookieHeader(path: string | null): string {
  const isProduction =
    typeof process !== "undefined" && process.env.NODE_ENV === "production";
  const secure = isProduction ? "; Secure" : "";
  if (!path) {
    return `${NEXT_PATH_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
  }
  return `${NEXT_PATH_COOKIE}=${encodeURIComponent(path)}; Path=/; SameSite=Lax; Max-Age=600${secure}`;
}

/** Read and validate the carry cookie out of a raw `Cookie` header. */
export function readNextPathCookie(
  cookieHeader: string | null | undefined
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${NEXT_PATH_COOKIE}=([^;]*)`)
  );
  if (!match) return null;
  let value = match[1];
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  return sanitizeNextPath(value);
}

/** Client-only: stash `next` before handing control to the OAuth provider. */
export function writeNextPathCookieClient(path: string | null): void {
  if (typeof document === "undefined") return;
  document.cookie = nextPathCookieHeader(path);
}
