import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
import { sendBetaWelcome, getBetaMailAllowance, prepareBetaWelcome, getBetaDeliveryStates } from "./beta-delivery";

type Entry = { id: string; entity_type: string; created_at: string; meta: Record<string, unknown> };
function database(legacy = false) {
  const rows = new Map<string, Entry>();
  let failAccepted = false;
  let failReads = false;
  const client = { from: (table: string) => ({
    insert: async (row: Entry) => {
      if (failAccepted && row.entity_type === "beta_email_accepted") return { error: { code: "08006" } };
      if (rows.has(row.id)) return { error: { code: "23505" } };
      rows.set(row.id, { ...row, created_at: new Date().toISOString() });
      return { error: null };
    },
    select: () => {
      const filters: Array<(row: Entry) => boolean> = [];
      const result = () => ({ data: (table === "audit_log" ? [...rows.values()] : legacy ? [{ email: "tester@example.com" } as unknown as Entry] : []).filter(r => filters.every(f => f(r))), error: failReads ? { code: "08006" } : null });
      const q = {
        in: (key: keyof Entry, values: unknown[]) => { filters.push(r => values.includes(r[key])); return q; },
        ilike: () => q, not: () => q, limit: () => q,
        eq: (key: keyof Entry, value: unknown) => { filters.push(r => r[key] === value); return q; },
        gte: (_key: string, value: string) => { filters.push(r => r.created_at >= value); return q; },
        lt: (_key: string, value: string) => { filters.push(r => r.created_at < value); return q; },
        maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ ...result(), count: result().data.length })),
      }; return q;
    },
  }) };
  return { client: client as unknown as ReturnType<typeof createAdminClient>, rows, failAccepted: () => { failAccepted = true; }, failReads: () => { failReads = true; } };
}
const args = { actorId: "admin", entityId: "person", email: "tester@example.com", accountExists: true, audience: "author" as const };

describe("beta welcome delivery", () => {
  beforeEach(() => {
    vi.useRealTimers(); vi.clearAllMocks();
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Verkli <hello@verkli.com>");
    mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("records acceptance and never sends a successful invitation again, even after 24 hours", async () => {
    const db = database();
    expect((await sendBetaWelcome(db.client, args)).status).toBe("sent");
    vi.useFakeTimers(); vi.setSystemTime(new Date(Date.now() + 48 * 60 * 60 * 1000));
    expect((await sendBetaWelcome(db.client, args)).status).toBe("already_sent");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][1].idempotencyKey).toMatch(/^beta-welcome\//);
    expect(mocks.send.mock.calls[0][0].text).toContain("tester@example.com");
  });
  it("retries an uncertain acceptance with the same immutable payload and key", async () => {
    const db = database();
    mocks.send.mockRejectedValueOnce(new Error("network interrupted"));
    expect((await sendBetaWelcome(db.client, args)).status).toBe("retry");
    expect((await sendBetaWelcome(db.client, { ...args, accountExists: false, name: "Changed" })).status).toBe("sent");
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });
  it("does not automatically retry an uncertain attempt beyond the provider key window", async () => {
    const db = database();
    mocks.send.mockRejectedValueOnce(new Error("network interrupted"));
    await sendBetaWelcome(db.client, args);
    for (const row of db.rows.values()) row.created_at = "2020-01-01T00:00:00.000Z";
    expect((await sendBetaWelcome(db.client, args)).status).toBe("review_required");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not report sent if acceptance could not be persisted", async () => {
    const db = database(); db.failAccepted();
    expect((await sendBetaWelcome(db.client, args)).status).toBe("retry");
  });
  it("requires a provider message ID rather than treating an empty response as success", async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    expect((await sendBetaWelcome(database().client, args)).status).toBe("retry");
  });
  it("reserves at most 20 attempts across concurrent callers", async () => {
    const db = database();
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => sendBetaWelcome(db.client, { ...args, email: `tester${i}@example.com` })));
    expect(results.filter(r => r.status === "sent")).toHaveLength(20);
    expect(results.filter(r => r.status === "daily_limit")).toHaveLength(5);
    expect(mocks.send).toHaveBeenCalledTimes(20);
    expect((await getBetaMailAllowance(db.client)).remaining).toBe(0);
  });
  it("fails closed when the delivery ledger cannot be read", async () => {
    const db = database(); db.failReads();
    expect((await sendBetaWelcome(db.client, args)).status).toBe("unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("blocks legacy invitation resends without changing their history", async () => {
    const db = database(true);
    expect((await sendBetaWelcome(db.client, args)).status).toBe("review_required");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await getBetaDeliveryStates(db.client, [{ email: args.email, audience: args.audience, invitedAt: null }])).toEqual(["Older invitation — review delivery before resending"]);
  });
  it("allows new-flow retries after access was reserved but email was unavailable", async () => {
    const db = database();
    expect(await prepareBetaWelcome(db.client, args)).toBeNull();
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await sendBetaWelcome(db.client, args)).status).toBe("unavailable");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    expect((await sendBetaWelcome(db.client, args)).status).toBe("sent");
  });
  it("persists meaningful delivery states across subsequent reads", async () => {
    const db = database();
    const recipient = [{ email: args.email, audience: args.audience, invitedAt: null }];
    expect(await getBetaDeliveryStates(db.client, recipient)).toEqual(["No welcome recorded in this delivery log"]);
    mocks.send.mockRejectedValueOnce(new Error("offline"));
    await sendBetaWelcome(db.client, args);
    expect((await getBetaDeliveryStates(db.client, recipient))[0]).toContain("safe to retry");
    await sendBetaWelcome(db.client, args);
    expect(await getBetaDeliveryStates(db.client, recipient)).toEqual(["Accepted by mail provider"]);
  });
  it("allows a distinct author welcome after a reader becomes an approved author", async () => {
    const db = database();
    await sendBetaWelcome(db.client, { ...args, audience: "reader" });
    await sendBetaWelcome(db.client, args);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][1]).not.toEqual(mocks.send.mock.calls[1][1]);
  });
  it("does not reserve or send when email configuration is absent", async () => {
    delete process.env.RESEND_API_KEY;
    const db = database();
    expect((await sendBetaWelcome(db.client, args)).status).toBe("unavailable");
    expect(db.rows.size).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
