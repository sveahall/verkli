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

    return buildEmailHtml({
      greeting,
      headline: "You're on the list.",
      subheading: "Welcome to the Verkli early access waitlist for readers.",
      bodyHtml: `
        <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${readerP1}</p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">${readerP2}</p>
      `,
      ctaLabel,
      ctaHref,
      variant,
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

  return buildEmailHtml({
    greeting,
    headline: "You're on the <em style=\"font-style:italic;color:#7c3fa0;\">list.</em>",
    subheading: "Welcome to the Verkli early access waitlist",
    bodyHtml,
    ctaLabel,
    ctaHref,
    variant,
  });
}

function buildEmailHtml(opts: {
  greeting: string;
  headline: string;
  subheading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
  variant: WaitlistVariant;
}): string {
  const { greeting, headline, subheading, bodyHtml, ctaLabel, ctaHref } = opts;

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verkli — You're on the list</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
  </head>
  <body style="margin:0;padding:0;background-color:#f4f3f5;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f4f3f5;">
      <tr>
        <td align="center" style="padding:48px 24px 64px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:500px;border-collapse:collapse;">
            <tr>
              <td style="border-radius:16px;background-color:#ffffff;padding:48px 44px 40px;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td align="center" style="padding-bottom:32px;">
                      <img src="https://www.verkli.com/logo-dark.svg" width="90" height="22" alt="Verkli" style="display:block;" />
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:4px;">
                      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#0d0b12;font-family:Georgia,'Times New Roman',serif;font-weight:400;letter-spacing:-0.02em;">${headline}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:12px;">
                      <p style="margin:0;font-size:13px;color:rgba(13,11,18,0.4);letter-spacing:0.01em;">${subheading}</p>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:36px;padding-bottom:4px;">
                      <p style="margin:0;font-size:14px;color:rgba(13,11,18,0.55);">${greeting}</p>
                    </td>
                  </tr>
                  <tr>
                    <td>${bodyHtml}</td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:32px;">
                      <a href="${ctaHref}" style="display:inline-block;padding:12px 36px;background-color:#0d0b12;color:#ffffff;border-radius:8px;font-size:13px;font-weight:500;text-align:center;text-decoration:none;letter-spacing:0.01em;">${ctaLabel}</a>
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-top:28px;">
                      <p style="margin:0;font-size:12px;line-height:1.6;color:rgba(13,11,18,0.32);">The Verkli team</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:20px;">
                <p style="margin:0;font-size:11px;color:rgba(13,11,18,0.3);letter-spacing:0.04em;">No public launch date announced</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}
