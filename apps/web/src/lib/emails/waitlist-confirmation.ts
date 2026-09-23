import { buildEmailShell } from "./layout";

type WaitlistVariant = "author" | "reader";

type WaitlistEmailOptions = {
  variant: WaitlistVariant;
  email: string;
  position: number;
  name?: string | null;
};

function getGreeting(name?: string | null): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return "Hi there,";
  }
  return `Hi ${escapeHtml(trimmed)},`;
}

function getSubject(variant: WaitlistVariant): string {
  if (variant === "reader") {
    return "You're on the Verkli reader waitlist";
  }
  return "You're on the Verkli waitlist";
}

export function buildWaitlistSubject(options: WaitlistEmailOptions): string {
  return getSubject(options.variant);
}

export function buildWaitlistHtml(options: WaitlistEmailOptions): string {
  const { variant, name } = options;
  const greeting = getGreeting(name);
  const isReader = variant === "reader";
  const email = escapeHtml(options.email);
  const pendingHtml = `
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">Your place on the waitlist is confirmed for <strong>${email}</strong>. Beta access is still pending.</p>
  `;
  const nextStepsHtml = `
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">If you're selected, we'll send a separate invitation with the sign-in or account setup steps. There's nothing you need to do yet.</p>
    <p style="margin:0;font-size:13px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">Questions? Email <a href="mailto:hello@verkli.com" style="color:#7c3fa0;">hello@verkli.com</a>.</p>
  `;

  const ctaLabel = "Visit verkli.com";
  const ctaHref = "https://www.verkli.com";

  if (isReader) {
    const readerP1 =
      "Thank you for signing up. We're inviting a small number of readers to help us test the experience and shape how stories are discovered and enjoyed.";

    return buildEmailShell({
      greeting,
      headline: "You're on the list.",
      subheading: "Welcome to the Verkli early access waitlist for readers.",
      bodyHtml: `
        ${pendingHtml}
        <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${readerP1}</p>
        ${nextStepsHtml}
      `,
      ctaLabel,
      ctaHref,
      title: "Verkli — You're on the list",
    });
  }

  const p1 =
    "We're inviting a small group of authors to test the publishing experience and help shape Verkli. Thank you for wanting to be part of it.";

  const highlightHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border-collapse:collapse;">
      <tr>
        <td style="padding:24px 28px;background-color:#faf8fc;border-radius:12px;text-align:center;">
          <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(124,63,160,0.55);">If you're selected</p>
          <p style="margin:10px 0 0 0;font-size:18px;line-height:1.3;color:#0d0b12;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-weight:600;">Verkli PRO for free</p>
          <p style="margin:6px 0 0 0;font-size:12px;color:rgba(13,11,18,0.35);">until public launch</p>
          <p style="margin:16px 0 0 0;font-size:13px;line-height:1.65;color:rgba(13,11,18,0.65);">Explore the publishing, translation, audiobook and marketing tools. AI generation has usage limits during the beta.</p>
        </td>
      </tr>
    </table>
  `;

  const bodyHtml = `
    ${pendingHtml}
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${p1}</p>
    ${highlightHtml}
    ${nextStepsHtml}
  `;

  return buildEmailShell({
    greeting,
    headline: "You're on the <em style=\"font-style:italic;color:#7c3fa0;\">list.</em>",
    subheading: "Welcome to the Verkli early access waitlist",
    bodyHtml,
    ctaLabel,
    ctaHref,
    title: "Verkli — You're on the list",
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
