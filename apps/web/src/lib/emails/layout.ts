/**
 * The one HTML shell every Verkli transactional email renders inside.
 *
 * Extracted from lib/emails/waitlist-confirmation, which is where it was born
 * and where it stayed until a second email (the beta invitation) needed the
 * same card. Nothing about the markup changed in the move — table-based layout,
 * inline styles and a 500px card, because email clients do not do modern CSS.
 *
 * Design tokens are hardcoded hex on purpose: `globals.css` OKLCH variables do
 * not exist in an inbox. The values here mirror DESIGN.md (ink #0d0b12, the
 * violet accent #7c3fa0, paper #f4f3f5).
 */

export function buildEmailShell(opts: {
  greeting: string;
  headline: string;
  subheading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
  /** Fine print under the card. */
  footnote?: string;
  /** Browser/tab title. Only visible in clients that show it. */
  title?: string;
}): string {
  const { greeting, headline, subheading, bodyHtml, ctaLabel, ctaHref } = opts;
  const footnote = opts.footnote ?? "No public launch date announced";
  const title = opts.title ?? "Verkli";

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
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
                <p style="margin:0;font-size:11px;color:rgba(13,11,18,0.3);letter-spacing:0.04em;">${footnote}</p>
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
