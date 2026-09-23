import { describe, expect, it } from "vitest";
import { selectFollowupRecipients } from "./beta-followup-recipients";

const applications = [
  { id: "a1", email: "Picked@Example.com ", first_name: "Pia" },
  { id: "a2", email: "not-picked@example.com", first_name: " Nils " },
  { id: "a3", email: "account-invite@example.com", first_name: null },
];
const waitlist = [
  { id: "w1", email: "picked@example.com", beta_invited_at: "2026-09-24T08:00:00Z" },
  { id: "w2", email: "not-picked@example.com", beta_invited_at: null },
  { id: "w3", email: "never-applied@example.com", beta_invited_at: null },
  { id: "w4", email: "NEVER-applied@example.com", beta_invited_at: null },
  { id: "w5", email: "invited-other@example.com", beta_invited_at: "2026-09-24T08:00:00Z" },
];

describe("round-one follow-up recipients", () => {
  it("never sends the 'not this round' mail to anyone who was invited, by any route", () => {
    const { recipients } = selectFollowupRecipients("applicant", applications, waitlist, new Set(["ACCOUNT-INVITE@example.com"]));
    expect(recipients).toEqual([{ id: "a2", email: "not-picked@example.com", name: "Nils" }]);
  });

  it("sends the waitlist mail only to people who neither applied nor were invited, once each", () => {
    const { recipients, summary } = selectFollowupRecipients("waitlist", applications, waitlist);
    expect(recipients.map(r => r.email)).toEqual(["never-applied@example.com"]);
    expect(summary).toBe("Excluded 2 applicant(s) and 1 other invited.");
  });

  it("blocks sending until at least one applicant has been invited", () => {
    const none = waitlist.map(w => ({ ...w, beta_invited_at: null }));
    expect(selectFollowupRecipients("applicant", applications, none).blocker).toMatch(/Invite the chosen authors first/);
    expect(selectFollowupRecipients("waitlist", applications, none).blocker).toMatch(/Invite the chosen authors first/);
    expect(selectFollowupRecipients("applicant", applications, waitlist).blocker).toBeNull();
  });
});
