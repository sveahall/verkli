import { timingSafeEqual } from "crypto";
import { apiError, E_FORBIDDEN, E_RATE_LIMIT_EXCEEDED } from "@/lib/api-errors";

// ─── Rate limiting for failed admin auth attempts ────────────────────────────
// Max 5 failed attempts per IP per 15-minute window. In-memory; resets on deploy.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type FailEntry = { count: number; windowStart: number };
const failMap = new Map<string, FailEntry>();

function getIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = failMap.get(ip);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    failMap.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count++;
  }
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = failMap.get(ip);
  if (!entry) return false;
  if (now - entry.windowStart > WINDOW_MS) {
    failMap.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

// ─── Minimal audit log ──────────────────────────────────────────────────────

function auditLog(ip: string, path: string, success: boolean): void {
  console.info(
    JSON.stringify({
      audit: "admin_auth",
      ip,
      path,
      success,
      ts: new Date().toISOString(),
    }),
  );
}

// ─── Timing-safe admin key check ─────────────────────────────────────────────

function keysMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validate admin API key from `x-admin-key` header.
 * Returns `null` on success or a NextResponse (403/429) on failure.
 */
export function checkAdmin(request: Request) {
  const ip = getIp(request);
  const path = new URL(request.url).pathname;

  if (isRateLimited(ip)) {
    auditLog(ip, path, false);
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  const adminKey = process.env.ADMIN_API_KEY?.trim();
  const key = request.headers.get("x-admin-key")?.trim();

  if (!adminKey || !key || !keysMatch(key, adminKey)) {
    recordFailure(ip);
    auditLog(ip, path, false);
    return apiError(E_FORBIDDEN, 403);
  }

  auditLog(ip, path, true);
  return null;
}

// Exported for testing only
export { failMap as _failMapForTesting };
