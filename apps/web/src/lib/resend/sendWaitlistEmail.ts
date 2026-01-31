/**
 * Server-only: sends waitlist confirmation email via Resend.
 * Call only from API routes or server actions.
 */
import { Resend } from "resend";

const FROM_EMAIL = "verkli <hello@verkli.com>";

function getHtml(role: "author" | "reader"): string {
  const isAuthor = role === "author";
  const roleDescription = isAuthor
    ? "verkli is a platform where authors share stories and connect with readers. We're in private pre-launch."
    : "verkli is a platform where readers discover stories from independent authors. We're in private pre-launch.";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a; min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 48px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px;">
          <tr>
            <td style="padding: 48px 40px; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; box-shadow: 0 4px 24px rgba(0,0,0,0.2);">
              <div style="margin-bottom: 28px; width: 32px; height: 3px; background-color: #907aff; border-radius: 2px;"></div>
              <p style="margin: 0 0 24px; font-size: 12px; font-weight: 600; letter-spacing: 0.15em; color: #907aff; text-transform: uppercase;">verkli</p>
              <h1 style="margin: 0 0 24px; font-size: 26px; font-weight: 600; color: #f8fafc; line-height: 1.25;">You're on the list</h1>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.65; color: #cbd5e1;">
                ${roleDescription}
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.65; color: #94a3b8;">
                You've joined as ${role === "author" ? "an" : "a"} <strong style="color: #e2e8f0;">${role}</strong>. We onboard in small waves — we'll reach out when it's your turn.
              </p>
              <div style="margin: 28px 0 0; padding-top: 24px; border-top: 1px solid #334155;"></div>
              <p style="margin: 0; font-size: 14px; color: #64748b;">— verkli</p>
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

export type WaitlistRole = "author" | "reader";

/**
 * Sends a waitlist confirmation email. Server-side only.
 * Uses RESEND_API_KEY. Fails silently if key is missing (logs warning).
 */
export async function sendWaitlistEmail(
  email: string,
  role: WaitlistRole
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("WAITLIST_EMAIL: RESEND_API_KEY not set, skipping confirmation email");
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "You are on the verkli waitlist.",
      html: getHtml(role),
    });

    if (error) {
      console.error("WAITLIST_EMAIL", {
        message: "Resend send failed",
        code: error.message,
        hint: "check RESEND_API_KEY and verkli.com domain",
      });
    }
  } catch (err) {
    console.error("WAITLIST_EMAIL", {
      message: "Resend exception",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
