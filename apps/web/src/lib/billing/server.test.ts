import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveBillingState, type BillingAccountRow } from "./state";

const database = vi.hoisted(() => ({
  results: {} as Record<string, { data: unknown; error: { message: string } | null }>,
  failures: new Set<string>(),
  reads: [] as { table: string; filters: Record<string, unknown> }[],
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        maybeSingle: async () => {
          database.reads.push({ table, filters });
          if (database.failures.has(table)) throw new Error("Database unavailable");
          return database.results[table] ?? { data: null, error: null };
        },
      };
      return query;
    },
  }),
}));

import { getBillingStateForUser, requireProBillingForApi } from "./server";
import { resolveBillingRole } from "@/lib/auth/billing-role";

const paidRow: BillingAccountRow = {
  provider: "stripe", user_id: "author-1", role: "author", plan: "pro", status: "active",
  stripe_customer_id: "cus_real", stripe_subscription_id: "sub_real",
  current_period_end: "2026-10-01T00:00:00Z", cancel_at_period_end: true,
  updated_at: "2026-09-18T00:00:00Z",
};

beforeEach(() => {
  vi.stubEnv("BETA_AUTHOR_PRO_ENABLED", "true");
  database.results = {
    profiles: { data: { role: "author" }, error: null },
    user_flags: { data: { beta_enabled: true }, error: null },
  };
  database.failures.clear();
  database.reads = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("author beta Pro entitlement", () => {
  it.each(["author", "admin"])("admits an invited %s with no Stripe row and preserves empty billing data", async (role) => {
    database.results.profiles.data = { role };
    const loaded = await getBillingStateForUser("author-1", "author");
    expect(loaded).toEqual({
      ok: true, row: null,
      state: { ...deriveBillingState(null), plan: "pro", isProActive: true, isBetaProActive: true },
    });
    expect(database.reads).toContainEqual({ table: "profiles", filters: { user_id: "author-1" } });
    expect(database.reads).toContainEqual({ table: "user_flags", filters: { user_id: "author-1" } });
    expect(await requireProBillingForApi("author-1")).toMatchObject({ ok: true });
  });

  it.each([false, null, "true"])("denies a missing or non-boolean beta grant (%s)", async (flag) => {
    database.results.user_flags.data = flag === null ? null : { beta_enabled: flag };
    const result = await requireProBillingForApi("author-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it.each(["reader", null, "writer"])("never grants Pro from a beta flag to profile role %s", async (role) => {
    database.results.profiles.data = role === null ? null : { role };
    expect(await getBillingStateForUser("author-1", "author")).toMatchObject({
      ok: true, state: { isProActive: false, isBetaProActive: false },
    });
  });

  it("does not grant author Pro in the reader view", async () => {
    expect(await getBillingStateForUser("author-1", "reader")).toMatchObject({
      ok: true, state: { plan: null, isProActive: false, isPlusActive: false, isBetaProActive: false },
    });
    expect(database.reads.map((read) => read.table)).toEqual(["billing_accounts"]);
  });

  it("rejects an author cookie on a reader account, even with an approved application", async () => {
    database.results.profiles.data = { role: "reader" };
    database.results.author_applications = { data: { status: "approved" }, error: null };
    const role = await resolveBillingRole(new Request("http://localhost/api/billing/state", {
      headers: { cookie: "active_role=author" },
    }), "author-1");
    expect(await getBillingStateForUser("author-1", role)).toMatchObject({
      ok: true, state: { isProActive: false, isBetaProActive: false },
    });
  });

  it.each([undefined, "false", "1", "TRUE"])("defaults closed unless the switch is exactly true (%s)", async (value) => {
    vi.stubEnv("BETA_AUTHOR_PRO_ENABLED", value);
    const result = await requireProBillingForApi("author-1");
    expect(result.ok).toBe(false);
    expect(database.reads.map((read) => read.table)).toEqual(["billing_accounts"]);
  });

  it("revokes the grant on the next read and keeps the release switch independent of BETA_LOCK", async () => {
    vi.stubEnv("BETA_LOCK", "false");
    expect(await requireProBillingForApi("author-1")).toMatchObject({ ok: true });
    database.results.user_flags.data = { beta_enabled: false };
    expect(await requireProBillingForApi("author-1")).toMatchObject({ ok: false });
    database.results.user_flags.data = { beta_enabled: true };
    vi.stubEnv("BETA_AUTHOR_PRO_ENABLED", "false");
    expect(await requireProBillingForApi("author-1")).toMatchObject({ ok: false });
  });

  it.each(["profiles", "user_flags"])("fails closed on a %s read error, without caching a grant", async (table) => {
    expect(await requireProBillingForApi("author-1")).toMatchObject({ ok: true });
    database.results[table].error = { message: "Read failed" };
    const result = await requireProBillingForApi("author-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
    expect(console.error).toHaveBeenCalledWith("[billing beta] failed to load author entitlement", expect.any(Object));
  });

  it("fails closed on a thrown transient flag read failure", async () => {
    database.failures.add("user_flags");
    const result = await requireProBillingForApi("author-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(500);
  });

  it.each(["active", "trialing"])("preserves %s paid Pro without any beta reads", async (status) => {
    const row = { ...paidRow, status };
    database.results.billing_accounts = { data: row, error: null };
    database.failures.add("profiles");
    database.failures.add("user_flags");
    expect(await getBillingStateForUser("author-1", "author")).toEqual({ ok: true, row, state: deriveBillingState(row) });
    expect(await requireProBillingForApi("author-1")).toMatchObject({ ok: true });
    expect(database.reads.every((read) => read.table === "billing_accounts")).toBe(true);
  });

  it("preserves paid Plus without relying on beta reads", async () => {
    const row = { ...paidRow, role: "reader" as const, plan: "plus" };
    database.results.billing_accounts = { data: row, error: null };
    expect(await getBillingStateForUser("author-1", "reader")).toEqual({ ok: true, row, state: deriveBillingState(row) });
    expect(database.reads.map((read) => read.table)).toEqual(["billing_accounts"]);
  });

  it("allows beta Pro through the API gate while retaining an actual past-due subscription", async () => {
    const row = { ...paidRow, status: "past_due" };
    database.results.billing_accounts = { data: row, error: null };
    const state = { ...deriveBillingState(row), plan: "pro", isProActive: true, isBetaProActive: true };
    expect(await getBillingStateForUser("author-1", "author")).toEqual({ ok: true, row, state });
    expect(await requireProBillingForApi("author-1")).toEqual({ ok: true, state });
    database.results.user_flags.data = { beta_enabled: false };
    const revoked = await requireProBillingForApi("author-1");
    expect(revoked.ok).toBe(false);
    if (!revoked.ok) expect(revoked.response.status).toBe(402);
  });
});
