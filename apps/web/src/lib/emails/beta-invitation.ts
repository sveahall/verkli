import { buildEmailShell } from "./layout";

export type BetaInvitationOptions = {
  /** Beta access is bound to this exact invited address. */
  email: string;
  name?: string | null;
  accountExists?: boolean;
  audience?: "author" | "reader";
};

export function buildBetaInvitationSubject(): string {
  return "You're in — welcome to the Verkli beta";
}

/** Keep the HTML and plain-text invitation consistent for every account state. */
function getInvitationContent(options: BetaInvitationOptions) {
  const audience = options.audience ?? "author";
  const accountExists = options.accountExists ?? false;
  const name = typeof options.name === "string" ? options.name.trim() : "";

  return {
    greeting: name ? `Hi ${name},` : "Hi there,",
    introduction: `You've been selected for the Verkli ${audience} beta. Your invitation is ready, and we'd love your help shaping what comes next.`,
    benefit: audience === "author" ? "Verkli Pro for free until public launch" : "Your reader beta access",
    detail: audience === "author"
      ? "Explore the publishing, translation, audiobook and marketing tools. AI generation has usage limits during the beta."
      : "Explore the available stories and help us improve how books are discovered and read.",
    account: accountExists
      ? `You already have a Verkli account. Sign in using exactly ${options.email}. Your beta access is tied to this email address.`
      : `Create your account using exactly ${options.email}. Your beta access is tied to this email address.`,
    setup: accountExists
      ? "If you haven't set a password or can't remember it, choose Forgot password on the sign-in page to set one."
      : "Choose a password on the signup page and confirm your email if asked.",
    steps: audience === "author"
      ? [
          "Open your author workspace and create or import a draft.",
          "Try one workflow: edit a chapter, preview a translation or prepare an audiobook.",
          "Tell us what worked, what felt unclear and where you got stuck.",
        ]
      : [
          "Open reader home and browse the available books.",
          "Open a book preview and try the reading experience.",
          "Tell us how discovery and reading felt, and where you got stuck.",
        ],
    ctaLabel: accountExists ? "Sign in to Verkli" : "Create your account",
    ctaHref: `https://www.verkli.com/${audience}/${accountExists ? "signin" : "signup"}`,
    subheading: `Welcome to the Verkli ${audience} beta`,
  };
}

export function buildBetaInvitationText(options: BetaInvitationOptions): string {
  const content = getInvitationContent(options);

  return [
    content.greeting,
    content.introduction,
    `${content.benefit}. ${content.detail}`,
    content.account,
    content.setup,
    `${content.ctaLabel}: ${content.ctaHref}`,
    "Your first steps",
    ...content.steps.map((step, index) => `${index + 1}. ${step}`),
    "Questions or feedback? Email hello@verkli.com. Include what you tried and any error message you saw.",
    "The Verkli team",
    "To decline this invitation, email hello@verkli.com.",
  ].join("\n\n");
}

export function buildBetaInvitationHtml(options: BetaInvitationOptions): string {
  const content = getInvitationContent(options);
  const bodyHtml = `
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${escapeHtml(content.introduction)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border-collapse:collapse;">
      <tr>
        <td style="padding:24px 28px;background-color:#faf8fc;border-radius:12px;text-align:center;">
          <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#7c3fa0;">Your invitation includes</p>
          <p style="margin:10px 0 0 0;font-size:18px;line-height:1.4;color:#0d0b12;font-weight:600;">${escapeHtml(content.benefit)}</p>
          <p style="margin:12px 0 0 0;font-size:13px;line-height:1.65;color:rgba(13,11,18,0.65);">${escapeHtml(content.detail)}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 12px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.75);text-align:center;">${escapeHtml(content.account)}</p>
    <p style="margin:0 0 24px 0;font-size:13px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${escapeHtml(content.setup)}</p>
    <p style="margin:0 0 12px 0;font-size:14px;font-weight:600;color:#0d0b12;">Your first steps</p>
    <ol style="margin:0 0 24px 0;padding-left:20px;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);">
      ${content.steps.map((step) => `<li style="margin-bottom:8px;">${escapeHtml(step)}</li>`).join("\n")}
    </ol>
    <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">Questions or feedback? Email <a href="mailto:hello@verkli.com" style="color:#7c3fa0;">hello@verkli.com</a>. Include what you tried and any error message you saw.</p>
  `;

  return buildEmailShell({
    greeting: escapeHtml(content.greeting),
    headline: "You're <em style=\"font-style:italic;color:#7c3fa0;\">in.</em>",
    subheading: content.subheading,
    bodyHtml,
    ctaLabel: content.ctaLabel,
    ctaHref: content.ctaHref,
    title: "Verkli — welcome to the beta",
    footnote: "To decline this invitation, email <a href=\"mailto:hello@verkli.com\" style=\"color:#7c3fa0;\">hello@verkli.com</a>.",
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
