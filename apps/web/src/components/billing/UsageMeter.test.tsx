import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsageMeter, type UsageMeterState } from "./UsageMeter";

const render = (state: UsageMeterState) => renderToStaticMarkup(<UsageMeter state={state} />);

describe("UsageMeter", () => {
  it("keeps beta unlimited without a fabricated percentage or checkout", () => {
    const html = render({ mode: "beta" });
    expect(html).toContain("Unlimited during beta");
    expect(html).toContain("No usage cap");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("% left");
    expect(html).not.toContain("href=");
  });

  it("shows remaining allowance, not consumed allowance", () => {
    const html = render({ mode: "metered", used: 10, limit: 100, resetLabel: "Resets in 6d 23h" });
    expect(html).toContain("90% left");
    expect(html).toContain('aria-valuenow="90"');
    expect(html).toContain("width:90%");
    expect(html).toContain("Resets in 6d 23h");
  });

  it("warns when allowance is low", () => {
    expect(render({ mode: "metered", used: 95, limit: 100 })).toContain("Your allowance is running low.");
  });

  it.each([[0, 100], [71, 29], [80, 20]])("shows the correct percentage with %s used", (used, left) => {
    expect(render({ mode: "metered", used, limit: 100 })).toContain(`${left}% left`);
  });

  it("does not round a positive balance down to exhausted", () => {
    const html = render({ mode: "metered", used: 99.9, limit: 100 });
    expect(html).toContain("&lt;1% left");
    expect(html).not.toContain("Allowance used up");
  });

  it.each([100, 120])("shows exhaustion at %s used and offers only a configured top-up", (used) => {
    const html = render({ mode: "metered", used, limit: 100, topUpHref: "/account/top-up" });
    expect(html).toContain("Allowance used up");
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain('href="/account/top-up"');
    expect(html).toContain("Top up");
  });

  it("does not invent a payment destination or reset period", () => {
    const html = render({ mode: "metered", used: 100, limit: 100 });
    expect(html).toContain("Top-ups are not available yet.");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("Resets");
  });

  it.each([
    { used: 0, limit: 0 },
    { used: -1, limit: 100 },
    { used: NaN, limit: 100 },
    { used: 10, limit: Infinity },
  ])("does not present invalid values as available allowance: %j", (values) => {
    const html = render({ mode: "metered", ...values });
    expect(html).toContain("Usage unavailable");
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("% left");
  });
});
