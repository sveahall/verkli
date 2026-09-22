import type { BetaFollowupKind } from "./beta-followup";

export type FollowupApplication = { id: string; email: string; first_name: string | null };
export type FollowupWaitlistRow = { id: string; email: string; beta_invited_at: string | null };
export type FollowupRecipient = { id: string; email: string; name: string | null };
export type FollowupSelection = {
  recipients: FollowupRecipient[];
  summary: string;
  /** Set when sending now would mail the wrong people. Dry runs still report. */
  blocker: string | null;
};

const norm = (email: string) => email.trim().toLowerCase();

/**
 * Who gets which round-one follow-up. `invitedEmails` must cover every
 * invitation route (waitlist stamp AND the invitation ledger), because an
 * applicant invited through an existing account never gets a waitlist stamp.
 */
export function selectFollowupRecipients(
  kind: BetaFollowupKind,
  applications: FollowupApplication[],
  waitlist: FollowupWaitlistRow[],
  invitedEmails: Set<string> = new Set(),
): FollowupSelection {
  const invited = new Set([...invitedEmails].map(norm));
  for (const row of waitlist) if (row.beta_invited_at) invited.add(norm(row.email));
  const applied = new Set(applications.map(a => norm(a.email)));
  const seen = new Set<string>();
  const unique = <T extends { email: string }>(rows: T[]) => rows.filter(r => {
    const email = norm(r.email);
    if (!email || seen.has(email)) return false;
    seen.add(email); return true;
  });
  const invitedApplicants = [...applied].filter(e => invited.has(e)).length;
  const blocker = invitedApplicants === 0
    ? "No applicant has been invited yet. Invite the chosen authors first, so none of them gets this mail."
    : null;

  if (kind === "applicant") {
    const recipients = unique(applications.filter(a => !invited.has(norm(a.email))))
      .map(a => ({ id: a.id, email: norm(a.email), name: a.first_name?.trim() || null }));
    return { recipients, blocker, summary: `Excluded ${invitedApplicants} invited applicant(s).` };
  }
  const recipients = unique(waitlist.filter(w => !invited.has(norm(w.email)) && !applied.has(norm(w.email))))
    .map(w => ({ id: w.id, email: norm(w.email), name: null }));
  const excludedApplied = waitlist.filter(w => applied.has(norm(w.email))).length;
  const excludedInvited = waitlist.filter(w => invited.has(norm(w.email)) && !applied.has(norm(w.email))).length;
  return { recipients, blocker, summary: `Excluded ${excludedApplied} applicant(s) and ${excludedInvited} other invited.` };
}
