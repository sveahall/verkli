/**
 * Single source of truth for active role: cookie "active_role".
 * Values: "reader" | "author".
 * Server reads from request/headers; client reads from cookie (same cookie, not httpOnly so both can read).
 */

export const ACTIVE_ROLE_COOKIE = "active_role";

export type ActiveRole = "reader" | "author";

const VALID_ROLES: ActiveRole[] = ["reader", "author"];

function parseRole(value: string | null | undefined): ActiveRole | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "reader" || v === "author") return v;
  return null;
}

/**
 * Server: get active role from incoming request (e.g. API route handler).
 */
export function getActiveRoleFromRequest(request: Request): ActiveRole | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${ACTIVE_ROLE_COOKIE}=([^;]+)`));
  return parseRole(match?.[1] ?? null);
}

/**
 * Server: get active role from Next.js cookies() in server components/layouts.
 */
export function getActiveRoleFromCookieValue(value: string | undefined): ActiveRole | null {
  return parseRole(value ?? null);
}

/**
 * Client-only: read active_role from document.cookie.
 * Use for logo routing and UI that must not guess from URL.
 */
export function getActiveRoleFromCookies(): ActiveRole | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`${ACTIVE_ROLE_COOKIE}=([^;]+)`));
  return parseRole(match?.[1] ?? null);
}

export function isValidActiveRole(role: string): role is ActiveRole {
  return VALID_ROLES.includes(role as ActiveRole);
}

/** Build Set-Cookie header value for active_role. Not httpOnly so client can read. */
export function activeRoleCookieHeader(role: ActiveRole): string {
  return `${ACTIVE_ROLE_COOKIE}=${role}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

/** Client-only: set active_role cookie so logo and server read same value. */
export function setActiveRoleCookieClient(role: ActiveRole): void {
  if (typeof document === "undefined") return;
  document.cookie = activeRoleCookieHeader(role);
}
