import { describe, expect, it, vi } from "vitest";
import { applyAccountUpdated } from "./stripe-connect";

type Row = {
  user_id: string;
  stripe_account_id: string;
  country: string;
  payouts_enabled: boolean;
  charges_enabled: boolean;
  details_submitted: boolean;
  capabilities: Record<string, unknown> | null;
  requirements: Record<string, unknown> | null;
  payout_schedule: "weekly" | "monthly";
  default_currency: string | null;
  created_at: string;
  updated_at: string;
};

function fakeAdmin(opts: { existingByAccountId: Map<string, Row> }) {
  const updates: Array<{ where: string; values: Record<string, unknown> }> = [];

  const fromImpl = vi.fn((table: string) => {
    if (table !== "author_payout_accounts") {
      throw new Error(`unexpected table ${table}`);
    }

    return {
      select() {
        return {
          eq(column: string, value: unknown) {
            return {
              maybeSingle: async () => {
                if (column === "stripe_account_id" && typeof value === "string") {
                  const row = opts.existingByAccountId.get(value);
                  return { data: row ?? null, error: null };
                }
                return { data: null, error: null };
              },
            };
          },
        };
      },
      update(values: Record<string, unknown>) {
        return {
          eq(column: string, value: unknown) {
            return {
              select() {
                return {
                  single: async () => {
                    updates.push({ where: `${column}=${String(value)}`, values });
                    // Find the existing row by user_id (we know the column is user_id here)
                    let updated: Row | null = null;
                    for (const r of opts.existingByAccountId.values()) {
                      if (r.user_id === value) {
                        updated = { ...r, ...values } as Row;
                        opts.existingByAccountId.set(updated.stripe_account_id, updated);
                        break;
                      }
                    }
                    if (!updated) {
                      return { data: null, error: { message: "not found" } };
                    }
                    return { data: updated, error: null };
                  },
                };
              },
            };
          },
        };
      },
    };
  });

  return { from: fromImpl, _updates: updates };
}

const baseRow: Row = {
  user_id: "user-1",
  stripe_account_id: "acct_test_123",
  country: "SE",
  payouts_enabled: false,
  charges_enabled: false,
  details_submitted: false,
  capabilities: null,
  requirements: { currently_due: ["business_profile.url"] },
  payout_schedule: "monthly",
  default_currency: null,
  created_at: "2026-04-29T00:00:00Z",
  updated_at: "2026-04-29T00:00:00Z",
};

describe("applyAccountUpdated", () => {
  it("returns nulls when the account is unknown to us", async () => {
    const admin = fakeAdmin({ existingByAccountId: new Map() });
    const out = await applyAccountUpdated(admin as unknown as Parameters<typeof applyAccountUpdated>[0], {
      id: "acct_unknown_999",
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
    } as unknown as import("stripe").default.Account);

    expect(out).toEqual({ userId: null, before: null, after: null });
    expect(admin._updates).toHaveLength(0);
  });

  it("flips payouts_enabled and persists the new state", async () => {
    const map = new Map<string, Row>([[baseRow.stripe_account_id, { ...baseRow }]]);
    const admin = fakeAdmin({ existingByAccountId: map });

    const account = {
      id: baseRow.stripe_account_id,
      country: "SE",
      payouts_enabled: true,
      charges_enabled: true,
      details_submitted: true,
      capabilities: { transfers: "active" },
      requirements: { currently_due: [] },
      default_currency: "sek",
    } as unknown as import("stripe").default.Account;

    const out = await applyAccountUpdated(admin as unknown as Parameters<typeof applyAccountUpdated>[0], account);

    expect(out.userId).toBe("user-1");
    expect(out.before?.payouts_enabled).toBe(false);
    expect(out.after?.payouts_enabled).toBe(true);
    expect(admin._updates).toHaveLength(1);
    const written = admin._updates[0]!.values;
    expect(written.payouts_enabled).toBe(true);
    expect(written.details_submitted).toBe(true);
    expect(written.default_currency).toBe("sek");
    expect(written.capabilities).toEqual({ transfers: "active" });
  });

  it("preserves country when Stripe returns null", async () => {
    const map = new Map<string, Row>([
      [baseRow.stripe_account_id, { ...baseRow, country: "US" }],
    ]);
    const admin = fakeAdmin({ existingByAccountId: map });

    const account = {
      id: baseRow.stripe_account_id,
      country: null,
      payouts_enabled: true,
    } as unknown as import("stripe").default.Account;

    const out = await applyAccountUpdated(admin as unknown as Parameters<typeof applyAccountUpdated>[0], account);
    expect(out.after?.country).toBe("US");
  });

  it("captures the updated requirements payload for audit comparison", async () => {
    const map = new Map<string, Row>([[baseRow.stripe_account_id, { ...baseRow }]]);
    const admin = fakeAdmin({ existingByAccountId: map });

    const account = {
      id: baseRow.stripe_account_id,
      country: "SE",
      payouts_enabled: false,
      charges_enabled: false,
      details_submitted: false,
      requirements: { currently_due: ["external_account"] },
    } as unknown as import("stripe").default.Account;

    const out = await applyAccountUpdated(admin as unknown as Parameters<typeof applyAccountUpdated>[0], account);
    expect(out.before?.requirements).toEqual({
      currently_due: ["business_profile.url"],
    });
    expect(out.after?.requirements).toEqual({
      currently_due: ["external_account"],
    });
  });
});
