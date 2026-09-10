/**
 * The beta invitation — the "personal invitation" the waitlist confirmation
 * email promised, sent to the people who signed up and then heard nothing.
 *
 * What it may and may not claim
 * -----------------------------
 * The confirmation email told every recipient that being selected means
 * "Verkli PRO for free until public launch, worth 1,200 EUR". This email is
 * that selection, so it repeats the promise in the same words rather than
 * quietly restating it as something smaller.
 *
 * It deliberately does NOT promise a number of audiobooks, translated words or
 * campaigns. Generation runs on metered third-party credit (ElevenLabs), and a
 * quantity in writing to 101 people is a commitment that has to hold on the day
 * they all click. Capabilities are described; volume is not.
 *
 * Access is tied to the address the invitation was sent to: signing up with it
 * flips `user_flags.beta_enabled` automatically (lib/auth/beta.ts,
 * grantBetaAccessIfInvited). Signing up with a different address lands the
 * person outside BETA_LOCK, which is why the email says so plainly.
 */

import { buildEmailShell } from "./layout";

export type BetaInvitationOptions = {
  /** The invited address. Shown to the reader — access is bound to it. */
  email: string;
  name?: string | null;
};

/** Where the invitation sends people. Allowlisted in BETA_LOCK_AUTH_PATHS. */
const SIGNUP_URL = "https://www.verkli.com/author/signup";

/** Same for everyone: there is nothing in the row worth putting in a subject. */
export function buildBetaInvitationSubject(): string {
  return "Your invitation to Verkli";
}

export function buildBetaInvitationHtml(options: BetaInvitationOptions): string {
  const trimmedName = typeof options.name === "string" ? options.name.trim() : "";
  const greeting = trimmedName ? `Hi ${trimmedName},` : "Hi there,";
  const email = escapeHtml(options.email);

  const p1 =
    "You joined the Verkli waitlist and we said we'd come back to you when there was something real to open. There is. You're invited into the first group of authors on the platform.";

  const p2 =
    "Verkli takes a finished manuscript and turns it into the formats a book needs to travel: a readable edition, an AI-narrated audiobook, translations, and the marketing copy that goes with a launch.";

  const highlightHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border-collapse:collapse;">
      <tr>
        <td style="padding:24px 28px;background-color:#faf8fc;border-radius:12px;text-align:center;">
          <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(124,63,160,0.55);">Your invitation includes</p>
          <p style="margin:10px 0 0 0;font-size:18px;line-height:1.3;color:#0d0b12;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-weight:600;">Verkli PRO for free</p>
          <p style="margin:6px 0 0 0;font-size:12px;color:rgba(13,11,18,0.35);">until public launch</p>
          <p style="margin:16px 0 0 0;font-size:13px;line-height:1.65;color:rgba(13,11,18,0.5);">Publishing, translation, audiobook generation and marketing tools, worth <strong style="color:rgba(13,11,18,0.75);font-weight:600;">1,200&nbsp;EUR</strong>.<br> <em style="font-style:italic;">No card, nothing to cancel.</em></p>
        </td>
      </tr>
    </table>
  `;

  // Load-bearing instruction, not a footnote: the auto-grant matches on this
  // address. Someone who signs up with a different one gets an account that
  // BETA_LOCK bounces, and no error message explains why.
  const addressHtml = `
    <p style="margin:0 0 18px 0;font-size:13px;line-height:1.7;color:rgba(13,11,18,0.5);text-align:center;">
      Sign up with <strong style="color:rgba(13,11,18,0.75);font-weight:600;">${email}</strong> — your access is tied to this address.
    </p>
  `;

  const p3 =
    "It's early, and it will look early in places. That's the point of inviting you now rather than in six months: what you run into shapes what gets built next. Reply to this email and it reaches a person.";

  const bodyHtml = `
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${p1}</p>
    <p style="margin:0 0 4px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${p2}</p>
    ${highlightHtml}
    ${addressHtml}
    <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${p3}</p>
  `;

  return buildEmailShell({
    greeting,
    headline: "You're <em style=\"font-style:italic;color:#7c3fa0;\">in.</em>",
    subheading: "Your invitation to the Verkli author beta",
    bodyHtml,
    ctaLabel: "Create your account",
    ctaHref: SIGNUP_URL,
    title: "Verkli — your invitation",
    footnote: "Not interested? Reply with “remove” and you won't hear from us again.",
  });
}

/**
 * The address is interpolated into HTML. Addresses are user-supplied strings
 * from a public form, so they are escaped rather than trusted — an unescaped
 * one would break the markup at best.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
