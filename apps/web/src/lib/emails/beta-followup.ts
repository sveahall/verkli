import { buildEmailShell } from "./layout";

/**
 * Round-one follow-ups. Neither mail grants access: `applicant` goes to people
 * who applied but were not picked, `waitlist` to people who never applied.
 */
export type BetaFollowupKind = "applicant" | "waitlist";

export type BetaFollowupOptions = { kind: BetaFollowupKind; name?: string | null };

export const BETA_FOLLOWUP_REPLY_TO = "hello@verkli.com";

function getFollowupContent(options: BetaFollowupOptions) {
  const name = typeof options.name === "string" ? options.name.trim() : "";
  const greeting = name ? `Hi ${name},` : "Hi there,";
  if (options.kind === "applicant") {
    return {
      greeting,
      subject: "Thank you for applying to the Verkli beta",
      headline: "Thank you for <em style=\"font-style:italic;color:#7c3fa0;\">applying.</em>",
      subheading: "You're first in line for the next round",
      ctaLabel: "Visit Verkli",
      ctaHref: "https://www.verkli.com",
      paragraphs: [
        "We've started the Verkli beta with a very small first group, so we can work closely with each author and fix what they run into.",
        "You weren't in this first round, but your application stays with us and you're first in line for the next one. We'll email you as soon as it opens.",
        "There's nothing you need to do now. If your book or your plans have changed since you applied, just reply to this email and tell us.",
      ],
    };
  }
  return {
    greeting,
    subject: "The Verkli beta has started",
    headline: "The beta has <em style=\"font-style:italic;color:#7c3fa0;\">started.</em>",
    subheading: "Thank you for waiting",
    ctaLabel: "Tell us about your book",
    ctaHref: `mailto:${BETA_FOLLOWUP_REPLY_TO}?subject=${encodeURIComponent("My book, for the next Verkli beta round")}`,
    paragraphs: [
      "You joined the Verkli waitlist, and we haven't forgotten you. We've just opened a small private beta with a handful of authors, and we'll open more places in rounds.",
      "Want to be considered for the next round? Reply to this email and tell us a little about your book: the genre, the language it's written in, and where you are in the process.",
      "You don't need to do anything to keep your place on the list.",
    ],
  };
}

export function buildBetaFollowupSubject(options: BetaFollowupOptions): string {
  return getFollowupContent(options).subject;
}

export function buildBetaFollowupText(options: BetaFollowupOptions): string {
  const content = getFollowupContent(options);
  return [content.greeting, ...content.paragraphs, "The Verkli team", "Verkli: https://www.verkli.com"].join("\n\n");
}

export function buildBetaFollowupHtml(options: BetaFollowupOptions): string {
  const content = getFollowupContent(options);
  const bodyHtml = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.7);text-align:center;">${escapeHtml(p)}</p>`)
    .join("\n");
  return buildEmailShell({
    greeting: escapeHtml(content.greeting),
    headline: content.headline,
    subheading: content.subheading,
    bodyHtml,
    ctaLabel: content.ctaLabel,
    ctaHref: content.ctaHref,
    title: `Verkli — ${content.subject.toLowerCase()}`,
    footnote: `Questions? Reply to this email or write to <a href="mailto:${BETA_FOLLOWUP_REPLY_TO}" style="color:#7c3fa0;">${BETA_FOLLOWUP_REPLY_TO}</a>.`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
