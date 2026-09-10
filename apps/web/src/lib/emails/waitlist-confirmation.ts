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
  return `Hi ${trimmed},`;
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

  const ctaLabel = "Visit verkli.com";
  const ctaHref = "https://www.verkli.com";

  if (isReader) {
    const readerP1 =
      "Thank you for signing up. We're inviting a small number of readers to help us test the experience and shape how stories are discovered and enjoyed.";
    const readerP2 =
      "When your access opens, you'll receive a personal invitation with setup details.";

    return buildEmailShell({
      greeting,
      headline: "You're on the list.",
      subheading: "Welcome to the Verkli early access waitlist for readers.",
      bodyHtml: `
        <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${readerP1}</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${readerP2}</p>
      `,
      ctaLabel,
      ctaHref,
      title: "Verkli — You're on the list",
    });
  }

  const p1 =
    "We're shaping the future of the book industry, and we're doing it with a small group of authors. Every author here will be handpicked, helping shape how the world reads, discovers and experiences stories.";
  const p2 = "Your book. Any language. Any format. Global readers.";
  const p3 =
    "When you're selected, you'll receive a personal invitation with everything you need to get started.";

  const highlightHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0;border-collapse:collapse;">
      <tr>
        <td style="padding:24px 28px;background-color:#faf8fc;border-radius:12px;text-align:center;">
          <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(124,63,160,0.55);">If you're selected</p>
          <p style="margin:10px 0 0 0;font-size:18px;line-height:1.3;color:#0d0b12;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;font-weight:600;">Verkli PRO for free</p>
          <p style="margin:6px 0 0 0;font-size:12px;color:rgba(13,11,18,0.35);">until public launch</p>
          <p style="margin:16px 0 0 0;font-size:13px;line-height:1.65;color:rgba(13,11,18,0.5);">Publishing, translation, audiobook generation and marketing tools, worth <strong style="color:rgba(13,11,18,0.75);font-weight:600;">1,200&nbsp;EUR</strong>.<br> <em style="font-style:italic;">Yours if you make the cut.</em></p>
        </td>
      </tr>
    </table>
  `;

  const bodyHtml = `
    <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${p1}</p>
    <p style="margin:0 0 4px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;font-weight:500;">${p2}</p>
    ${highlightHtml}
    <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${p3}</p>
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
