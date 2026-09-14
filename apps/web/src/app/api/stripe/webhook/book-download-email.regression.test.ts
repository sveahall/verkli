import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Launch QA, 2026-09-10: closing the success page lost the only download link.
// Exercise the signed route and its retry guard; stub only DB and email I/O.
const state = vi.hoisted(() => ({ send: vi.fn(), events: new Set<string>() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: state.send }; } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== "stripe_events") throw new Error(`Unexpected table: ${table}`);
      return {
        insert: async (row: { stripe_event_id: string }) => {
          if (state.events.has(row.stripe_event_id)) return { error: { code: "23505" } };
          state.events.add(row.stripe_event_id);
          return { error: null };
        },
        delete: () => ({ eq: async (_key: string, id: string) => {
          state.events.delete(id);
          return { error: null };
        } }),
      };
    },
  }),
}));
const { POST } = await import("./route");
const stripe = new Stripe("sk_test_qa", { apiVersion: "2025-02-24.acacia" });
const session = {
  id: "cs_test_ebook_qa",
  payment_status: "paid",
  customer_email: "buyer@example.com",
  metadata: { payment_kind: "book_order", order_variant: "ebook" },
};
function event(object = session, id = "evt_ebook_qa", type = "checkout.session.completed") {
  const body = JSON.stringify({ id, type, data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_qa" });
  return POST(new Request("https://www.verkli.com/api/stripe/webhook", {
    method: "POST", body, headers: { "stripe-signature": signature },
  }));
}
beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_qa");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_qa");
  vi.stubEnv("RESEND_API_KEY", "re_qa");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.verkli.com");
  state.events.clear();
  state.send.mockReset().mockResolvedValue({ data: { id: "email_qa" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("paid standalone e-book delivery", () => {
  it("emails a return link after payment and does not resend duplicate events", async () => {
    expect((await event()).status).toBe(200);
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "buyer@example.com",
      text: expect.stringContaining("https://www.verkli.com/order/ta-for-er/success?session_id=cs_test_ebook_qa"),
      html: expect.stringContaining("Ladda ner din bok"),
    }), { idempotencyKey: "book-download/cs_test_ebook_qa" });
    expect((await event()).status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("waits for delayed payment to settle", async () => {
    expect((await event({ ...session, payment_status: "unpaid" })).status).toBe(200);
    expect(state.send).not.toHaveBeenCalled();
    expect((await event(session, "evt_settled", "checkout.session.async_payment_succeeded")).status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("never gives a printed-book buyer the e-book link", async () => {
    expect((await event({ ...session, metadata: { ...session.metadata, order_variant: "print" } })).status).toBe(200);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("retries a failed email instead of permanently acknowledging delivery", async () => {
    state.send.mockResolvedValueOnce({ data: null, error: { message: "provider unavailable" } });
    expect((await event()).status).toBe(500);
    expect(state.events.has("evt_ebook_qa")).toBe(false);
    expect((await event()).status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[0][1]).toEqual(state.send.mock.calls[1][1]);
  });

  it("uses the same provider deduplication key for different events for one session", async () => {
    await event();
    await event(session, "evt_settled", "checkout.session.async_payment_succeeded");
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[0][1]).toEqual(state.send.mock.calls[1][1]);
  });

  it("does not acknowledge delivery when email configuration is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await event()).status).toBe(500);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.events.size).toBe(0);
  });
});
