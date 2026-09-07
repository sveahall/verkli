import "server-only";

/**
 * Billing plan catalog: maps Stripe price_id to (role, plan_key) via DB table billing_plan_catalog.
 * Single source of truth for plan resolution; no hardcoded price ids in code.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type CatalogRole = "reader" | "author";
export type CatalogPlanKey = "plus" | "pro";
/** Billing period. One catalog row per (role, plan, interval). */
export type CatalogInterval = "month" | "year";

export const DEFAULT_INTERVAL: CatalogInterval = "month";

export type CatalogRow = {
  provider: string;
  role: CatalogRole;
  plan_key: CatalogPlanKey;
  price_id: string;
  is_active: boolean;
  interval: CatalogInterval;
  /**
   * Which Stripe mode this row's price_id belongs to, or null when the column
   * does not exist yet. Null means "cannot tell", which is treated as a match
   * so this code works both before and after the livemode migration.
   */
  livemode: boolean | null;
};

export type StripeMode = "live" | "test";

/**
 * The mode of the key this process will actually call Stripe with.
 *
 * A catalog row is only usable by a key in its own mode. Mixing them is not a
 * degraded experience, it is a hard failure: Stripe answers `No such price`
 * and the checkout route turns that into a 500. Production shipped in exactly
 * that state — live key, test price ids — so the mode is read here and used to
 * filter, rather than assumed to line up.
 *
 * Returns null when no key is configured (a developer without Stripe set up,
 * or a test run), in which case no filtering happens and every row is offered.
 */
export function getStripeMode(
  env: Record<string, string | undefined> = process.env
): StripeMode | null {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_live") || key.startsWith("rk_live")) return "live";
  if (key.startsWith("sk_test") || key.startsWith("rk_test")) return "test";
  return null;
}

/**
 * Whether a row can be used by a key in `mode`. A row that does not say which
 * mode it belongs to matches anything — that is the pre-migration state, and
 * excluding those rows would take checkout down rather than protect it.
 */
export function rowMatchesMode(row: CatalogRow, mode: StripeMode | null): boolean {
  if (mode === null) return true;
  if (row.livemode === null) return true;
  return row.livemode === (mode === "live");
}

export type ResolvedRolePlan = {
  role: CatalogRole;
  planKey: CatalogPlanKey;
};

const PROVIDER_STRIPE = "stripe";
const CACHE_TTL_MS = 60_000;
const BYPASS_CACHE_ENV = "BILLING_CATALOG_BYPASS_CACHE";

let cache: { rows: CatalogRow[]; expiresAt: number } | null = null;

function now(): number {
  return Date.now();
}

function isCacheBypass(): boolean {
  return process.env[BYPASS_CACHE_ENV] === "1" || process.env[BYPASS_CACHE_ENV] === "true";
}

function normalizeRole(value: unknown): CatalogRole | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "reader" || v === "author") return v;
  return null;
}

function normalizePlanKey(value: unknown): CatalogPlanKey | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "plus" || v === "pro") return v;
  return null;
}

/**
 * Rows written before the interval column existed carry no value, and they are
 * all monthly — so absent means month rather than invalid. That also lets this
 * code ship before the column does.
 */
function normalizeInterval(value: unknown): CatalogInterval {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "year" || v === "annual" || v === "yearly" ? "year" : DEFAULT_INTERVAL;
}

function normalizeRow(raw: Record<string, unknown> | null): CatalogRow | null {
  if (!raw || typeof raw !== "object") return null;
  const provider = String(raw.provider ?? "").trim();
  const role = normalizeRole(raw.role);
  const plan_key = normalizePlanKey(raw.plan_key);
  const price_id = String(raw.price_id ?? "").trim();
  const is_active = Boolean(raw.is_active ?? true);
  const interval = normalizeInterval(raw.interval);
  // Absent (pre-migration) is distinct from false. Coercing it with Boolean()
  // would label every legacy row test-mode and empty the catalog on a live key.
  const livemode = typeof raw.livemode === "boolean" ? raw.livemode : null;
  if (!provider || !role || !plan_key || !price_id) return null;
  return { provider, role, plan_key, price_id, is_active, interval, livemode };
}

/**
 * Fetches active rows from billing_plan_catalog (provider='stripe', is_active=true).
 * Uses in-memory cache with TTL 60s unless BILLING_CATALOG_BYPASS_CACHE=1.
 */
export async function getPlanCatalog(): Promise<CatalogRow[]> {
  if (!isCacheBypass() && cache && now() < cache.expiresAt) {
    return cache.rows;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("billing_plan_catalog" as never)
    // `*` rather than a column list: the interval column is added by a
    // migration that may not have run yet, and naming a missing column makes
    // PostgREST reject the whole query.
    .select("*")
    .eq("provider", PROVIDER_STRIPE)
    .eq("is_active", true);

  if (error) {
    throw new Error(`billing_plan_catalog read failed: ${error.message}`);
  }

  const mode = getStripeMode();
  const rows: CatalogRow[] = [];
  const list = Array.isArray(data) ? data : [];
  for (const item of list) {
    const row = normalizeRow(item as Record<string, unknown>);
    // Filtered here rather than in the query: naming `livemode` in a PostgREST
    // filter makes the whole request fail where the column does not exist yet,
    // which is why the select above is `*`.
    if (row && rowMatchesMode(row, mode)) rows.push(row);
  }

  if (!isCacheBypass()) {
    cache = { rows, expiresAt: now() + CACHE_TTL_MS };
  }

  return rows;
}

/**
 * Resolves price ids to a single (role, planKey). One subscription = one role.
 * - If multiple price ids match the same role: pick highest plan within that role (pro > plus).
 * - If price ids match both reader and author: treat as data bug, return null (do not guess).
 * - If no match: return null.
 */
export async function resolveRolePlanFromPriceIds(
  priceIds: string[]
): Promise<ResolvedRolePlan | null> {
  if (priceIds.length === 0) return null;

  const catalog = await getPlanCatalog();
  const byRole: Map<CatalogRole, CatalogPlanKey[]> = new Map();

  for (const priceId of priceIds) {
    const normalized = priceId.trim().toLowerCase();
    if (!normalized) continue;
    for (const row of catalog) {
      if (row.price_id.trim().toLowerCase() === normalized) {
        const existing = byRole.get(row.role) ?? [];
        if (!existing.includes(row.plan_key)) {
          existing.push(row.plan_key);
          byRole.set(row.role, existing);
        }
        break;
      }
    }
  }

  const roles = Array.from(byRole.keys());
  if (roles.length === 0) return null;
  if (roles.length > 1) {
    return null;
  }

  const role = roles[0];
  const planKeys = byRole.get(role) ?? [];
  const planKey = planKeys.includes("pro") ? "pro" : planKeys.includes("plus") ? "plus" : null;
  if (!planKey) return null;

  return { role, planKey };
}

/**
 * Sync version for tests: pass preloaded rows to avoid DB and cache.
 */
export function resolveRolePlanFromPriceIdsWithCatalog(
  priceIds: string[],
  catalog: CatalogRow[]
): ResolvedRolePlan | null {
  if (priceIds.length === 0) return null;

  const byRole: Map<CatalogRole, CatalogPlanKey[]> = new Map();

  for (const priceId of priceIds) {
    const normalized = priceId.trim().toLowerCase();
    if (!normalized) continue;
    for (const row of catalog) {
      if (row.price_id.trim().toLowerCase() === normalized) {
        const existing = byRole.get(row.role) ?? [];
        if (!existing.includes(row.plan_key)) {
          existing.push(row.plan_key);
          byRole.set(row.role, existing);
        }
        break;
      }
    }
  }

  const roles = Array.from(byRole.keys());
  if (roles.length === 0) return null;
  if (roles.length > 1) return null;

  const role = roles[0];
  const planKeys = byRole.get(role) ?? [];
  const planKey = planKeys.includes("pro") ? "pro" : planKeys.includes("plus") ? "plus" : null;
  if (!planKey) return null;

  return { role, planKey };
}

/** For tests: clear in-memory cache. */
export function clearCatalogCache(): void {
  cache = null;
}

/**
 * Returns Stripe price_id for (role, planKey). Used by checkout.
 */
export async function getPriceIdForRolePlan(
  role: CatalogRole,
  planKey: CatalogPlanKey,
  interval: CatalogInterval = DEFAULT_INTERVAL
): Promise<string | null> {
  return selectPriceIdFromCatalog(await getPlanCatalog(), role, planKey, interval);
}

/**
 * The row-selection half of getPriceIdForRolePlan, without the DB read, so the
 * refuse-to-guess rule below is directly testable.
 */
export function selectPriceIdFromCatalog(
  catalog: CatalogRow[],
  role: CatalogRole,
  planKey: CatalogPlanKey,
  interval: CatalogInterval = DEFAULT_INTERVAL
): string | null {
  const matches = catalog.filter(
    (r) => r.role === role && r.plan_key === planKey && r.interval === interval
  );

  // More than one match is a data bug, and `.find()` used to resolve it by
  // silently taking whichever row PostgREST happened to return first. With
  // live and test rows now sharing the table, that coin flip decides whether
  // the price id is in the same mode as the key — i.e. whether the checkout
  // works at all. Refuse rather than guess; the caller turns null into a
  // logged 500, which is a debuggable failure instead of an intermittent one.
  if (matches.length > 1) {
    console.error("[billing.catalog] multiple rows for one plan — refusing to guess", {
      role,
      planKey,
      interval,
      priceIds: matches.map((r) => r.price_id),
    });
    return null;
  }

  return matches[0]?.price_id ?? null;
}

/**
 * Which intervals can actually be bought for this plan. The pricing page asks
 * before offering an annual toggle, so a missing annual row shows a monthly-only
 * page rather than a button that 500s.
 */
export async function getAvailableIntervals(
  role: CatalogRole,
  planKey: CatalogPlanKey
): Promise<CatalogInterval[]> {
  const catalog = await getPlanCatalog();
  return catalog
    .filter((r) => r.role === role && r.plan_key === planKey)
    .map((r) => r.interval);
}
