import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAvailableIntervals: vi.fn(),
}));

vi.mock("@/lib/billing/catalog", () => ({
  getAvailableIntervals: mocks.getAvailableIntervals,
}));

vi.mock("./PricingPageContent", () => ({
  default: vi.fn(() => null),
}));

const { default: PricingPage } = await import("./page");

/**
 * The gap this guards: the marketing page advertised annual billing — a toggle,
 * a $19 figure, a "Save 35%" badge — while the catalog held no annual row, so
 * checkout could only ever sell monthly. What is offered here has to be what
 * can actually be bought.
 */
describe("PricingPage annual availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers annual when the catalog has a yearly row", async () => {
    mocks.getAvailableIntervals.mockResolvedValue(["month", "year"]);

    const element = await PricingPage();

    expect(mocks.getAvailableIntervals).toHaveBeenCalledExactlyOnceWith("author", "pro");
    expect(element.props.annualAvailable).toBe(true);
  });

  it("hides annual when the catalog is monthly only", async () => {
    mocks.getAvailableIntervals.mockResolvedValue(["month"]);

    const element = await PricingPage();

    expect(element.props.annualAvailable).toBe(false);
  });

  it("hides annual when the catalog read fails", async () => {
    // Build time has no service-role key; the honest fallback is monthly.
    mocks.getAvailableIntervals.mockRejectedValue(new Error("no service role key"));

    const element = await PricingPage();

    expect(element.props.annualAvailable).toBe(false);
  });
});
