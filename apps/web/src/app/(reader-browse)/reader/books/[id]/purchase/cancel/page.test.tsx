import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), markOrderFailedForUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/payments/purchase", () => ({ markOrderFailedForUser: mocks.markOrderFailedForUser }));
import Page from "./page";
let calls: Array<[string, unknown]>;
let response: { data: unknown; error: unknown };
let user: { id: string } | null;
async function render(orderId = "order-1") {
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ id: "book-1" }), searchParams: Promise.resolve({ order_id: orderId }) }));
}
beforeEach(() => {
  vi.clearAllMocks(); calls = []; user = { id: "reader-1" };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  response = { data: { id: "order-1", user_id: "reader-1", book_id: "book-1", stripe_session_id: "cs_1",
    status: "pending", provider: "stripe", amount: 4900, currency: "SEK", chapter_id: null }, error: null };
  const chain = {
    select: (fields: string) => { calls.push(["select", fields]); return chain; },
    eq: (key: string, value: unknown) => { calls.push([key, value]); return chain; },
    maybeSingle: async () => response,
  };
  mocks.createClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => { calls.push(["from", table]); return chain; } });
});
describe("checkout closed GET", () => {
  it("renders neutral copy without writes and links only the exact owned bound order", async () => {
    const html = await render();
    expect(mocks.markOrderFailedForUser).not.toHaveBeenCalled();
    expect(html).toContain("Checkout closed");
    expect(html).toContain("Do not pay again");
    expect(html).not.toContain("No charge was made");
    expect(html).toContain("Check purchase status");
    expect(html).toContain("order_id=order-1&amp;session_id=cs_1");
    expect(calls).toEqual([["from", "orders"], ["select", "*"], ["id", "order-1"], ["user_id", "reader-1"], ["book_id", "book-1"]]);
  });
  it.each([null, false, {}, { id: "order-1", user_id: "other" },
    { id: "order-1", user_id: "reader-1", book_id: "book-1", stripe_session_id: null },
    { id: "order-1", user_id: "reader-1", book_id: "other", stripe_session_id: "cs_1" }])("withholds unverified status links for %j", async (data) => {
    response.data = data;
    const html = await render();
    expect(html).not.toContain("Check purchase status");
    expect(html).toContain("contact support");
    expect(html).toContain('href="/support"');
    expect(mocks.markOrderFailedForUser).not.toHaveBeenCalled();
  });
  it("withholds links on query errors even if data is present", async () => {
    response.error = { code: "42501" };
    expect(await render()).not.toContain("Check purchase status");
  });
  it.each([{ id: "other" }, { status: "unknown" }, { provider: "other" }, { chapter_id: "chapter-1" },
    { chapter_id: undefined }, { amount: "4900" }, { currency: " " }, { stripe_session_id: " " }])(
    "withholds a malformed or mismatched stored order link %j", async (bad) => {
      response.data = { ...(response.data as Record<string, unknown>), ...bad };
      expect(await render()).not.toContain("Check purchase status");
      expect(mocks.markOrderFailedForUser).not.toHaveBeenCalled();
    });
  it("preserves a usable owned legacy order link without a chapter column", async () => {
    delete (response.data as Record<string, unknown>).chapter_id;
    expect(await render()).toContain("Check purchase status");
    expect(mocks.markOrderFailedForUser).not.toHaveBeenCalled();
  });
  it("handles a thrown session lookup without a write, misleading link, or raw message", async () => {
    mocks.createClient.mockRejectedValueOnce(new Error("private transport details"));
    const html = await render();
    expect(html).toContain("contact support");
    expect(html).not.toContain("Check purchase status");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private transport details");
    expect(mocks.markOrderFailedForUser).not.toHaveBeenCalled();
  });
  it("does not look up malformed query identities or signed-out users", async () => {
    expect(await render("order?invalid")).not.toContain("Check purchase status");
    expect(calls).toEqual([]);
    user = null;
    expect(await render()).not.toContain("Check purchase status");
    expect(calls).toEqual([]);
  });
});
