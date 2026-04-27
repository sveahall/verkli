/**
 * Beta gating: isBetaUser(supabase, userId) reads user_flags.beta_enabled.
 *
 * Source of truth for cohort membership: `public.reader_waitlist`.
 *   - admin invites a user by setting `reader_waitlist.invited_at`
 *   - the admin grant flow (see `grantBetaAccess`) upserts
 *     `user_flags.beta_enabled = true` and invalidates this cache
 *   - middleware reads `user_flags.beta_enabled` via `isBetaUser`
 *
 * Failure semantics: this function distinguishes
 *   (a) RLS deny / no row  → return false (legitimately non-beta)
 *   (b) transient errors    → throw BetaCheckTransientError
 * Callers (middleware) must catch (b) and respond with maintenance state, NOT
 * silently downgrade users to non-beta. See CEO plan §C3.
 *
 * Caching: per-process Map with 30s TTL, mirroring `authorRoleCache` in
 * middleware.ts. Mitigates Supabase hot-spotting at cohort launch (§C4).
 */

import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

// ─── Custom error class ──────────────────────────────────────────────────────

export class BetaCheckTransientError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "BetaCheckTransientError";
    this.cause = cause;
  }
}

// ─── In-memory cache ─────────────────────────────────────────────────────────

const BETA_CACHE_TTL_MS = 30_000;
const BETA_CACHE_MAX = 512;

type BetaCacheEntry = { value: boolean; expiresAt: number };
const betaCache = new Map<string, BetaCacheEntry>();

function readCachedBeta(userId: string): boolean | null {
  const entry = betaCache.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    betaCache.delete(userId);
    return null;
  }
  return entry.value;
}

function writeCachedBeta(userId: string, value: boolean): void {
  if (betaCache.size >= BETA_CACHE_MAX) {
    const first = betaCache.keys().next().value;
    if (first) betaCache.delete(first);
  }
  betaCache.set(userId, { value, expiresAt: Date.now() + BETA_CACHE_TTL_MS });
}

/**
 * Invalidate the cached beta status for a user. Call from the admin-grant flow
 * (`grantBetaAccess`) and from any place that toggles `user_flags.beta_enabled`.
 *
 * Per-process only: in serverless deploys with multiple instances, peers will
 * keep their stale entry until the 30s TTL expires. That's the accepted
 * eventual-consistency window.
 */
export function invalidateBetaCache(userId: string): void {
  betaCache.delete(userId);
}

/** Test/admin helper: clear the entire cache. */
export function clearBetaCache(): void {
  betaCache.clear();
}

// ─── Error classification ────────────────────────────────────────────────────

const TRANSIENT_PG_CODES = new Set<string>([
  "57014", // query_canceled
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "53300", // too_many_connections
  "53400", // configuration_limit_exceeded
]);

function isTransientPgError(err: PostgrestError): boolean {
  if (err.code && TRANSIENT_PG_CODES.has(err.code)) return true;
  // Some network-class failures arrive without a pg code (fetch failed at the
  // edge before hitting Postgres). Match on message as a fallback.
  if (!err.code && err.message) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout") ||
      msg.includes("socket")
    ) {
      return true;
    }
  }
  return false;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function isBetaUser(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const cached = readCachedBeta(userId);
  if (cached !== null) return cached;

  const { data, error } = await supabase
    .from("user_flags")
    .select("beta_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isTransientPgError(error)) {
      throw new BetaCheckTransientError(
        "user_flags lookup failed (transient)",
        error
      );
    }
    // Non-transient error (e.g. RLS denial): treat as legitimately not-beta.
    writeCachedBeta(userId, false);
    return false;
  }

  const value = Boolean(data?.beta_enabled);
  writeCachedBeta(userId, value);
  return value;
}

/**
 * Admin grant flow — canonical path for moving a user from waitlist → cohort.
 *
 * Flow (reader_waitlist is source of truth):
 *   1. user signs up via /waitlist  → row inserted in `reader_waitlist`
 *   2. admin invites               → `reader_waitlist.invited_at = now()`
 *   3. user creates auth account   → `auth.users` row exists for this email
 *   4. admin (or a trigger) calls grantBetaAccess(adminClient, userId)
 *      which upserts `user_flags.beta_enabled = true` and invalidates the
 *      per-process cache for this userId.
 *
 * MUST be called with a service-role client (`createAdminClient()`); RLS on
 * `user_flags` blocks regular users from writing other users' rows.
 */
export async function grantBetaAccess(
  adminSupabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminSupabase
    .from("user_flags")
    .upsert(
      { user_id: userId, beta_enabled: true },
      { onConflict: "user_id" }
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  // Best-effort: invalidate this process's cache. Other instances will pick
  // up the new value within BETA_CACHE_TTL_MS (30s).
  invalidateBetaCache(userId);

  return { ok: true };
}

/**
 * Admin revoke — symmetric counterpart to grantBetaAccess. Sets
 * `user_flags.beta_enabled = false` (does not delete the row, so audit history
 * stays intact). Caller responsible for ensuring this is the right user.
 */
export async function revokeBetaAccess(
  adminSupabase: SupabaseClient,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminSupabase
    .from("user_flags")
    .upsert(
      { user_id: userId, beta_enabled: false },
      { onConflict: "user_id" }
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  invalidateBetaCache(userId);
  return { ok: true };
}
