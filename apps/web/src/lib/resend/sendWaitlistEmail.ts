/**
 * Server-only: access flow emails via Resend.
 * Call only from API routes or server actions.
 */
import { Resend } from "resend";

const FROM_EMAIL = "verkli <hello@verkli.com>";

export type WaitlistRole = "author" | "reader";

/**
 * Request received (after form submit). Minimal. No confirmation, no gratitude.
 */
export async function sendWaitlistEmail(
  email: string,
  _role: WaitlistRole
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("WAITLIST_EMAIL: RESEND_API_KEY not set, skipping");
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Request",
      text: "We'll be in touch.",
    });

    if (error) {
      console.error("WAITLIST_EMAIL", { message: "Resend send failed", code: error.message });
    }
  } catch (err) {
    console.error("WAITLIST_EMAIL", {
      message: "Resend exception",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Access approved. One clear action.
 */
export async function sendAccessApprovalEmail(
  email: string,
  signInUrl: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("ACCESS_APPROVAL_EMAIL: RESEND_API_KEY not set, skipping");
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Access",
      text: `Your access is ready.\n\nSign in: ${signInUrl}`,
    });

    if (error) {
      console.error("ACCESS_APPROVAL_EMAIL", { message: "Resend send failed", code: error.message });
    }
  } catch (err) {
    console.error("ACCESS_APPROVAL_EMAIL", {
      message: "Resend exception",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Rejection or delay. Calm. No apology. No justification.
 */
export async function sendRejectionOrDelayEmail(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("REJECTION_EMAIL: RESEND_API_KEY not set, skipping");
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Update",
      text: "We're not able to offer access right now. We may reach out later.\n\nNo reply needed.",
    });

    if (error) {
      console.error("REJECTION_EMAIL", { message: "Resend send failed", code: error.message });
    }
  } catch (err) {
    console.error("REJECTION_EMAIL", {
      message: "Resend exception",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
