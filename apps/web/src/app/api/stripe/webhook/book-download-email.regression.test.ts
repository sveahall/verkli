import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Launch QA, 2026-09-10: closing the success page lost the only download link.
// Exercise the signed route and its retry guard; stub only DB and email I/O.
const state = vi.hoisted(() => ({
  send: vi.fn(),
  events: new Map<string, string>(),
  insert: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
}));
vi.mock("resend", () => ({ Resend: class { emails = { send: state.send }; } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      state.from(table);
      if (table !== "stripe_events") throw new Error(`Unexpected table: ${table}`);
      return {
        insert: state.insert,
        select: () => ({ eq: (_key: string, id: string) => ({
          maybeSingle: () => state.read(id),
        }) }),
        delete: () => ({ eq: (_key: string, id: string) => state.remove(id) }),
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
const markerId = `book-download-email:${session.id}`;
const markerType = "book_download_email.accepted";
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
  state.from.mockReset();
  state.insert.mockReset().mockImplementation(async (row: { stripe_event_id: string; type: string }) => {
    if (state.events.has(row.stripe_event_id)) return { error: { code: "23505" } };
    state.events.set(row.stripe_event_id, row.type);
    return { error: null };
  });
  state.read.mockReset().mockImplementation(async (id: string) => ({
    data: state.events.has(id) ? { stripe_event_id: id } : null,
    error: null,
  }));
  state.remove.mockReset().mockImplementation(async (id: string) => {
    state.events.delete(id);
    return { error: null };
  });
  state.send.mockReset().mockResolvedValue({ data: { id: "email_qa" }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

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

  it("does not resend accepted email for the same or a new event beyond the provider window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    expect((await event()).status).toBe(200);
    expect(state.events.get(markerId)).toBe(markerType);
    vi.setSystemTime(Date.now() + 48 * 60 * 60 * 1000);
    expect((await event()).status).toBe(200);
    expect((await event(session, "evt_settled", "checkout.session.async_payment_succeeded")).status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it("recovers a failed send when rollback also fails and leaves the event claim", async () => {
    state.send.mockResolvedValueOnce({ data: null, error: { message: "provider unavailable" } });
    state.remove.mockResolvedValueOnce({ error: { code: "08006", message: "database unavailable" } });
    expect((await event()).status).toBe(500);
    expect(state.events.has("evt_ebook_qa")).toBe(true);
    expect(state.events.has(markerId)).toBe(false);
    expect((await event()).status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.events.get(markerId)).toBe(markerType);
    expect(state.send.mock.calls[0][1]).toEqual(state.send.mock.calls[1][1]);
    expect(state.remove).toHaveBeenCalledWith("evt_ebook_qa");
    expect(state.remove).not.toHaveBeenCalledWith(markerId);
  });

  it.each(["checkout.session.completed", "checkout.session.async_payment_succeeded"])(
    "recovers %s after a process exit left only the generic claim", async (type) => {
      state.events.set("evt_ebook_qa", type);
      expect((await event(session, "evt_ebook_qa", type)).status).toBe(200);
      expect(state.send).toHaveBeenCalledTimes(1);
      expect(state.events.get(markerId)).toBe(markerType);
    }
  );

  it.each([false, true])("retries a marker read failure, existing generic claim=%s", async (duplicate) => {
    if (duplicate) state.events.set("evt_ebook_qa", "checkout.session.completed");
    state.read.mockResolvedValueOnce({ data: null, error: { code: "08006", message: "read unavailable" } });
    expect((await event()).status).toBe(500);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.events.has(markerId)).toBe(false);
    expect((await event()).status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("retries an acceptance marker write failure with the same provider key, duplicate=%s", async (duplicate) => {
    if (duplicate) state.events.set("evt_ebook_qa", "checkout.session.completed");
    const insert = state.insert.getMockImplementation()!;
    state.insert.mockImplementation(async (row: { stripe_event_id: string; type: string }) => {
      if (row.stripe_event_id === markerId) return { error: { code: "08006", message: "write unavailable" } };
      return insert(row);
    });
    expect((await event()).status).toBe(500);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.events.has(markerId)).toBe(false);
    state.insert.mockImplementation(insert);
    expect((await event()).status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[0][1]).toEqual(state.send.mock.calls[1][1]);
    expect(state.events.get(markerId)).toBe(markerType);
  });

  it("waits for provider acceptance before recording its marker", async () => {
    state.send.mockImplementationOnce(async () => {
      expect(state.events.has(markerId)).toBe(false);
      return { data: { id: "email_qa" }, error: null };
    });
    expect((await event()).status).toBe(200);
    expect(state.events.get(markerId)).toBe(markerType);
  });

  it("does not record acceptance without a provider message id", async () => {
    state.send.mockResolvedValueOnce({ data: null, error: null });
    expect((await event()).status).toBe(500);
    expect(state.events.has(markerId)).toBe(false);
  });

  it("concurrent callbacks reuse the provider key and accept a duplicate marker insert", async () => {
    let acceptFirst!: (value: { data: { id: string }; error: null }) => void;
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    state.send.mockImplementationOnce(() => {
      firstStarted();
      return new Promise((resolve) => { acceptFirst = resolve; });
    });
    const first = event();
    await started;
    expect((await event(session, "evt_settled", "checkout.session.async_payment_succeeded")).status).toBe(200);
    acceptFirst({ data: { id: "email_qa" }, error: null });
    expect((await first).status).toBe(200);
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls[0][1]).toEqual(state.send.mock.calls[1][1]);
    expect(state.events.get(markerId)).toBe(markerType);
    expect(state.insert.mock.calls.filter(([row]) => row.stripe_event_id === markerId)).toHaveLength(2);
  });

  it.each([
    { object: { ...session, payment_status: "unpaid" }, type: "checkout.session.completed" },
    { object: { ...session, metadata: { ...session.metadata, order_variant: "print" } }, type: "checkout.session.completed" },
    { object: { ...session, metadata: { ...session.metadata, payment_kind: "donation" } }, type: "checkout.session.completed" },
    { object: session, type: "checkout.session.expired" },
    { object: session, type: "customer.subscription.updated" },
  ])("does not replay unrelated duplicate callbacks: $type $object", async ({ object, type }) => {
    state.events.set("evt_ebook_qa", type);
    expect((await event(object, "evt_ebook_qa", type)).status).toBe(200);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.read).not.toHaveBeenCalled();
  });

  it.each(["", "t=1,v1=invalid"])("rejects missing or invalid signatures before DB/email work: %s", async (signature) => {
    state.events.set("evt_ebook_qa", "checkout.session.completed");
    const body = JSON.stringify({ id: "evt_ebook_qa", type: "checkout.session.completed", data: { object: session } });
    const response = await POST(new Request("https://www.verkli.com/api/stripe/webhook", {
      method: "POST", body, headers: { "stripe-signature": signature },
    }));
    expect(response.status).toBe(400);
    expect(state.from).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();
  });

  it("does not acknowledge delivery when email configuration is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await event()).status).toBe(500);
    expect(state.send).not.toHaveBeenCalled();
    expect(state.events.size).toBe(0);
  });
});
