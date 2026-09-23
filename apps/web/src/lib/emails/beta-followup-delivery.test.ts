import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
import { BETA_FOLLOWUP_DAILY_LIMIT, getSentBetaFollowups, sendBetaFollowup } from "./beta-followup-delivery";

type Entry = { id: string; entity_type: string; created_at: string; meta: Record<string, unknown> };
function database() {
  const rows = new Map<string, Entry>();
  const client = { from: () => ({
    insert: async (row: Entry) => {
      if (rows.has(row.id)) return { error: { code: "23505" } };
      rows.set(row.id, { ...row, created_at: new Date().toISOString() });
      return { error: null };
    },
    select: () => {
      const filters: Array<(row: Entry) => boolean> = [];
      const result = () => ({ data: [...rows.values()].filter(r => filters.every(f => f(r))), error: null });
      const q = {
        eq: (key: keyof Entry, value: unknown) => { filters.push(r => r[key] === value); return q; },
        in: (key: keyof Entry, values: unknown[]) => { filters.push(r => values.includes(r[key])); return q; },
        maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result())),
      }; return q;
    },
  }) };
  return { client: client as unknown as ReturnType<typeof createAdminClient>, rows };
}
const args = { kind: "applicant" as const, entityId: "app-1", email: " Nils@Example.com ", name: "Nils" };

describe("beta follow-up delivery", () => {
  beforeEach(() => {
    vi.useRealTimers(); vi.clearAllMocks();
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("RESEND_FROM_EMAIL", "Verkli <hello@verkli.com>");
    mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  it("sends once with reply-to, and never again even days later", async () => {
    const db = database();
    expect((await sendBetaFollowup(db.client, args)).status).toBe("sent");
    const [payload, options] = mocks.send.mock.calls[0];
    expect(payload).toMatchObject({ to: "nils@example.com", replyTo: "hello@verkli.com", subject: "Thank you for applying to the Verkli beta" });
    expect(payload.text).toContain("Hi Nils,");
    expect(options.idempotencyKey).toMatch(/^beta-followup\//);
    vi.useFakeTimers(); vi.setSystemTime(new Date(Date.now() + 72 * 60 * 60 * 1000));
    expect((await sendBetaFollowup(db.client, args)).status).toBe("already_sent");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(await getSentBetaFollowups(db.client, "applicant", ["nils@example.com", "other@example.com"])).toEqual(new Set(["nils@example.com"]));
  });

  it("keeps the applicant and waitlist ledgers apart", async () => {
    const db = database();
    await sendBetaFollowup(db.client, args);
    expect((await sendBetaFollowup(db.client, { ...args, kind: "waitlist" })).status).toBe("sent");
    expect(mocks.send.mock.calls[1][0].subject).toBe("The Verkli beta has started");
  });

  it("retries an unconfirmed send with the same stored payload and key", async () => {
    const db = database();
    mocks.send.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded" } });
    expect((await sendBetaFollowup(db.client, args)).status).toBe("retry");
    expect((await sendBetaFollowup(db.client, args)).status).toBe("sent");
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });

  it("stops at the daily budget without calling the provider", async () => {
    const db = database();
    for (let i = 0; i < BETA_FOLLOWUP_DAILY_LIMIT; i++) {
      expect((await sendBetaFollowup(db.client, { ...args, entityId: `e${i}`, email: `p${i}@example.com` })).status).toBe("sent");
    }
    expect((await sendBetaFollowup(db.client, { ...args, email: "late@example.com" })).status).toBe("daily_limit");
    expect(mocks.send).toHaveBeenCalledTimes(BETA_FOLLOWUP_DAILY_LIMIT);
  });

  it("sends nothing without mail credentials", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await sendBetaFollowup(database().client, args)).status).toBe("unavailable");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
