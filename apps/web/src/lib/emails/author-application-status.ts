type ApplicationDecision = "approved" | "rejected";

type ApplicationStatusEmailOptions = {
  decision: ApplicationDecision;
  firstName?: string | null;
};

function getGreeting(firstName?: string | null): string {
  const trimmed = typeof firstName === "string" ? firstName.trim() : "";
  if (!trimmed) return "Hi there,";
  return `Hi ${trimmed},`;
}

export function buildApplicationStatusSubject(
  options: ApplicationStatusEmailOptions
): string {
  if (options.decision === "approved") {
    return "Your Verkli author application has been approved";
  }
  return "Update on your Verkli author application";
}

export function buildApplicationStatusHtml(
  options: ApplicationStatusEmailOptions
): string {
  const { decision, firstName } = options;
  const greeting = getGreeting(firstName);

  if (decision === "approved") {
    return buildEmailHtml({
      greeting,
      headline: "You're in.",
      subheading: "Your author application has been approved",
      bodyHtml: `
        <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">
          Welcome to the Verkli author community. You now have full access to our publishing tools — upload your books, reach readers worldwide, and start building your audience.
        </p>
        <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">
          Sign in and switch to author mode to get started.
        </p>
      `,
      ctaLabel: "Go to Verkli",
      ctaHref: "https://www.verkli.com/reader/home",
    });
  }

  return buildEmailHtml({
    greeting,
    headline: "Application update",
    subheading: "Regarding your author application",
    bodyHtml: `
      <p style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">
        Thank you for your interest in publishing on Verkli. After reviewing your application, we're unable to approve it at this time.
      </p>
      <p style="margin:0;font-size:14px;line-height:1.7;color:rgba(13,11,18,0.65);text-align:center;">
        You're welcome to continue using Verkli as a reader and apply again in the future.
      </p>
    `,
    ctaLabel: "Visit Verkli",
    ctaHref: "https://www.verkli.com/reader/home",
  });
}

function buildEmailHtml(opts: {
  greeting: string;
  headline: string;
  subheading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaHref: string;
}): string {
  const { greeting, headline, subheading, bodyHtml, ctaLabel, ctaHref } = opts;

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verkli — ${headline}</title>
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
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}
