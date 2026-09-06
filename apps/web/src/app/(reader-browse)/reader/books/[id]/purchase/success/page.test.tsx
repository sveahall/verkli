import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmStripeBookPurchase: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/payments/purchase", () => ({
  confirmStripeBookPurchase: mocks.confirmStripeBookPurchase,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock("@/lib/flags", () => ({
  getDiscoverHref: vi.fn(() => "/reader/discover"),
}));

const { default: PurchaseSuccessPage } = await import("./page");

async function render(result: "paid" | "processing" | "failed") {
  mocks.confirmStripeBookPurchase.mockResolvedValue(result);
  const tree = await PurchaseSuccessPage({
    params: Promise.resolve({ id: "book-1" }),
    searchParams: Promise.resolve({ order_id: "order-1", session_id: "cs_123" }),
  });
  return renderToStaticMarkup(tree);
}

describe("PurchaseSuccessPage status copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "reader-1" } } });
  });

  it("tells an uncertain buyer not to pay again and gives a bounded next step", async () => {
    const html = await render("processing");

    expect(html).toContain("still checking your purchase status");
    expect(html).toContain("Do not pay again");
    expect(html).toContain("reload this page");
    expect(html).toContain("contact support");
    expect(html).not.toContain("unlocks automatically");
  });

  it("confirms purchased access without promising full-book or receipt delivery", async () => {
    const html = await render("paid");

    expect(html).toContain("Your purchased access is ready");
    expect(html).not.toContain("This book is now unlocked");
    expect(html).not.toContain("receipt is on its way");
  });

  it("does not encourage another payment when verification fails conclusively", async () => {
    const html = await render("failed");

    expect(html).toContain("contact support");
    expect(html).not.toContain("try again");
  });
});
