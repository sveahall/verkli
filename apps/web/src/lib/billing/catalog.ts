/**
 * Billing plan catalog: maps Stripe price_id to (role, plan_key) via DB table billing_plan_catalog.
 * Single source of truth for plan resolution; no hardcoded price ids in code.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type CatalogRole = "reader" | "author";
export type CatalogPlanKey = "plus" | "pro";

export type CatalogRow = {
  provider: string;
  role: CatalogRole;
  plan_key: CatalogPlanKey;
  price_id: string;
  is_active: boolean;
};

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

function normalizeRow(raw: Record<string, unknown> | null): CatalogRow | null {
  if (!raw || typeof raw !== "object") return null;
  const provider = String(raw.provider ?? "").trim();
  const role = normalizeRole(raw.role);
  const plan_key = normalizePlanKey(raw.plan_key);
  const price_id = String(raw.price_id ?? "").trim();
  const is_active = Boolean(raw.is_active ?? true);
  if (!provider || !role || !plan_key || !price_id) return null;
  return { provider, role, plan_key, price_id, is_active };
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
    .select("provider, role, plan_key, price_id, is_active")
    .eq("provider", PROVIDER_STRIPE)
    .eq("is_active", true);

  if (error) {
    throw new Error(`billing_plan_catalog read failed: ${error.message}`);
  }

  const rows: CatalogRow[] = [];
  const list = Array.isArray(data) ? data : [];
  for (const item of list) {
    const row = normalizeRow(item as Record<string, unknown>);
    if (row) rows.push(row);
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
  planKey: CatalogPlanKey
): Promise<string | null> {
  const catalog = await getPlanCatalog();
  const row = catalog.find(
    (r) => r.role === role && r.plan_key === planKey
  );
  return row?.price_id ?? null;
}
