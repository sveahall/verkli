import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/features/author/settings/actions", () => ({ saveAuthorSettings: vi.fn(), signOutAllSessions: vi.fn() }));
vi.mock("@/features/author-workspaces/components/WorkspaceHeaderActions", () => ({ default: () => null }));
import SettingsPage from "./SettingsPage";
import { DEFAULT_AI_SETTINGS } from "@/features/ai-team/settings/contracts";
import SubscriptionPlanSection from "./SubscriptionPlanSection";

describe("author account settings", () => {
  it("keeps an index to real sections, one save action and the separate subscription slot", () => {
    const html = renderToStaticMarkup(<SettingsPage user={{ email: "sample@example.test" }} profile={{ preferences: {} }} aiSettings={DEFAULT_AI_SETTINGS} subscriptionPlanSection={<p>Subscription slot</p>} />);
    for (const section of ["account", "security", "defaults", "notifications", "ai", "billing"]) {
      expect(html).toContain(`href="#settings-${section}"`);
      expect(html).toContain(`id="settings-${section}"`);
    }
    expect(html.match(/>Save settings<\/button>/g)).toHaveLength(1);
    expect(html).toContain("Subscription slot");
    expect(html).toContain('role="status"');
    expect(html).toContain('autoComplete="new-password"');
    for (const field of ["new_password", "confirm_password", "default_language", "default_visibility", "email_notifications"]) expect(html).toContain(`name="${field}"`);
  });
  it("posts every AI field through the same single save action", () => {
    const html = renderToStaticMarkup(<SettingsPage user={{ email: "sample@example.test" }} profile={{ preferences: {} }} aiSettings={DEFAULT_AI_SETTINGS} />);
    const fields = ["ai_enabled", "ai_memory_enabled", "ai_reply_style", "ai_warmth", "ai_enthusiasm", "ai_structure", "ai_emoji", "ai_match_writing_voice", "ai_nickname", "ai_craft", "ai_about", "ai_instructions"];
    for (const field of fields) expect(html.match(new RegExp(`name="${field}"`, "g"))).toHaveLength(1);
    expect(html.match(/>Save settings<\/button>/g)).toHaveLength(1);
  });
  it("keeps the configured values in the form when AI is switched off, so nothing is wiped on save", () => {
    const html = renderToStaticMarkup(
      <SettingsPage user={{ email: "sample@example.test" }} profile={{ preferences: {} }}
        aiSettings={{ ...DEFAULT_AI_SETTINGS, aiEnabled: false, replyStyle: "candid", instructions: "Never rewrite dialogue." }} />
    );
    expect(html).toContain("Never rewrite dialogue.");
    expect(html).toContain('name="ai_reply_style"');
    expect(html.match(/name="ai_reply_style"/g)).toHaveLength(1);
  });
  it("keeps subscription fields and currency accessible", () => {
    const html = renderToStaticMarkup(<SubscriptionPlanSection initialEnabled initialPriceMonthly={4900} initialCurrency="sek" initialDescription="Books" />);
    expect(html).toContain('for="subscription-price"');
    expect(html).toContain('aria-label="Subscription currency"');
    expect(html).toContain('for="subscription-description"');
    expect(html).toContain('value="49"');
  });
});
