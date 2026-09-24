import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CampaignResultsSummary } from "./CampaignResultsSummary";

describe("campaign result provenance", () => {
  it("shows an empty campaign without inventing zero reach, clicks or purchases", () => {
    const html = renderToStaticMarkup(<CampaignResultsSummary posts={[]} />);
    expect(html).toContain("No campaign posts have been saved yet.");
    expect(html.match(/Not measured/g)).toHaveLength(3);
    expect(html).toContain("Attributed purchases");
    expect(html).not.toContain("0 purchases");
  });
  it("treats posted flags and client metadata as workflow rather than measured results", () => {
    const posts = [{ status: "posted", metadata: { reach: 123456, clicks: 888888, purchases: 999999, delivery: { state: "published" } } }, { status: "ready" }];
    const html = renderToStaticMarkup(<CampaignResultsSummary posts={posts} />);
    expect(html).toContain("1 of 2 posts marked as shared");
    expect(html).toContain("manual workflow status");
    expect(html.match(/Not measured/g)).toHaveLength(3);
    for (const forged of ["123456", "888888", "999999"]) expect(html).not.toContain(forged);
    expect(html).toContain("No winning channel or budget change can be inferred");
  });
  it("labels local simulation explicitly and never promotes it to measured performance", () => {
    const html = renderToStaticMarkup(<CampaignResultsSummary posts={[{ status: "ready" }]} testMode />);
    expect(html).toContain("Synthetic test data");
    expect(html).toContain("Simulated deliveries do not measure reach, clicks or purchases.");
    expect(html.match(/Not measured/g)).toHaveLength(3);
  });
});
