import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/features/author/settings/actions", () => ({ saveAuthorSettings: vi.fn(), signOutAllSessions: vi.fn() }));
vi.mock("@/features/author-workspaces/components/WorkspaceHeaderActions", () => ({ default: () => null }));
import SettingsPage from "./SettingsPage";
import SubscriptionPlanSection from "./SubscriptionPlanSection";

describe("author account settings", () => {
  it("keeps an index to real sections, one save action and the separate subscription slot", () => {
    const html = renderToStaticMarkup(<SettingsPage user={{ email: "sample@example.test" }} profile={{ preferences: {} }} subscriptionPlanSection={<p>Subscription slot</p>} />);
    for (const section of ["account", "security", "defaults", "notifications", "billing"]) {
      expect(html).toContain(`href="#settings-${section}"`);
      expect(html).toContain(`id="settings-${section}"`);
    }
    expect(html.match(/>Save settings<\/button>/g)).toHaveLength(1);
    expect(html).toContain("Subscription slot");
    expect(html).toContain('role="status"');
    expect(html).toContain('autoComplete="new-password"');
    for (const field of ["new_password", "confirm_password", "default_language", "default_visibility", "email_notifications"]) expect(html).toContain(`name="${field}"`);
  });
  it("keeps subscription fields and currency accessible", () => {
    const html = renderToStaticMarkup(<SubscriptionPlanSection initialEnabled initialPriceMonthly={4900} initialCurrency="sek" initialDescription="Books" />);
    expect(html).toContain('for="subscription-price"');
    expect(html).toContain('aria-label="Subscription currency"');
    expect(html).toContain('for="subscription-description"');
    expect(html).toContain('value="49"');
  });
});
