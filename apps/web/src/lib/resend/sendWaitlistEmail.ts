/**
 * Server-only: sends waitlist confirmation email via Resend.
 * Call only from API routes or server actions.
 */
import { Resend } from "resend";

const FROM_EMAIL = "Verkli <hello@verkli.com>";

function getHtml(role: "writer" | "reader", position?: number): string {
  const roleLabel = role === "writer" ? "writer" : "reader";
  const positionLine =
    position != null ? `<p style="margin: 0 0 16px; color: #94a3b8;">Your position: <strong style="color: #e2e8f0;">#${position}</strong></p>` : "";

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
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px;">
          <tr>
            <td style="padding: 40px 32px; background-color: #1e293b; border-radius: 12px; border: 1px solid #334155;">
              <p style="margin: 0 0 24px; font-size: 14px; font-weight: 600; letter-spacing: 0.05em; color: #907aff; text-transform: uppercase;">Verkli</p>
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 600; color: #f8fafc; line-height: 1.3;">You are on the list</h1>
              <p style="margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #cbd5e1;">
                Thanks for signing up. You've joined the waitlist as a <strong style="color: #e2e8f0;">${roleLabel}</strong>.
              </p>
              ${positionLine}
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #94a3b8;">
                We'll be in touch when it's your turn.
              </p>
              <p style="margin: 32px 0 0; font-size: 14px; color: #64748b;">— Verkli</p>
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

export type WaitlistRole = "writer" | "reader";

/**
 * Sends a waitlist confirmation email. Server-side only.
 * Uses RESEND_API_KEY. Fails silently if key is missing (logs warning).
 */
export async function sendWaitlistEmail(
  email: string,
  role: WaitlistRole,
  position?: number
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
      subject: "You are on the Verkli waitlist",
      html: getHtml(role, position),
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
