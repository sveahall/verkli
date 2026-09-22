import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewsletterAudienceSummary } from "./NewsletterAudienceSummary";

describe("newsletter audience review", () => {
  it("keeps an unavailable audience distinct from zero", () => {
    const html = renderToStaticMarkup(<NewsletterAudienceSummary activeCount={null} />);
    expect(html).toContain("Count unavailable");
    expect(html).not.toContain("No active subscribers yet");
    expect(html).toContain("Reload this draft to try again");
  });
  it("shows a real empty audience without pretending anyone will receive mail", () => {
    const html = renderToStaticMarkup(<NewsletterAudienceSummary activeCount={0} />);
    expect(html).toContain("No active subscribers yet");
    expect(html).not.toContain("Count unavailable");
  });
  it("labels counts as subscription snapshots and keeps unsubscribe preview inert", () => {
    const html = renderToStaticMarkup(<NewsletterAudienceSummary activeCount={12} testMode />);
    expect(html).toContain("12 active subscriptions");
    expect(html).toContain("Synthetic test data");
    expect(html).toContain("The final recipient count can change");
    expect(html).toContain("Unsubscribe preview");
    expect(html).not.toContain("href=");
    expect(html).not.toContain("token=");
  });
});
