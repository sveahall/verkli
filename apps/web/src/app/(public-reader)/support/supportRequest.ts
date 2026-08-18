/**
 * Support request submission.
 *
 * Posts to the existing role-agnostic `POST /api/feedback` route. That route is
 * owned by another work package, so its contract is fixed from here:
 *
 *   { type: "bug" | "idea" | "other", message: string (<= 2000), url?, request_id? }
 *
 * Two consequences shape this module:
 *
 * 1. There is no field for a reply address, and an anonymous reader has no
 *    account we could answer through. Dropping the address would mean every
 *    anonymous support request lands in a table with no way to respond — which
 *    is the exact gap this page exists to close. So the address is folded into
 *    the message body behind an explicit label, where whoever triages the row
 *    in /admin/feedback can read it. When `feedback` grows a real
 *    `reply_email` column, move it there and delete `composeSupportMessage`.
 *
 * 2. The 2000-char server cap has to hold *after* that line is appended, so the
 *    textarea is capped lower (`SUPPORT_MESSAGE_MAX`) and the email input at
 *    `SUPPORT_EMAIL_MAX`. The two plus the label always fit under 2000.
 */

import { resolveErrorMessage } from "@/lib/error-messages";

/** Server-side cap on `feedback.message`. Mirrors the zod schema on the route. */
const API_MESSAGE_MAX = 2000;

/** Max length accepted in the message textarea. */
export const SUPPORT_MESSAGE_MAX = 1800;

/** Max length accepted in the reply-address field. */
export const SUPPORT_EMAIL_MAX = 120;

const REPLY_LABEL = "Reply to:";

/** Route that works even when the write path does not. */
const EMAIL_FALLBACK = "Email hello@verkli.com and we will pick it up there.";
const SAVE_FAILED_PREFIX = "We could not save your message.";

/** The three values `feedback.type` accepts, per its CHECK constraint. */
export type SupportTopic = "bug" | "idea" | "other";

export const SUPPORT_TOPICS: ReadonlyArray<{
  value: SupportTopic;
  label: string;
}> = [
  { value: "bug", label: "Something is not working" },
  { value: "other", label: "A question about my account or a purchase" },
  { value: "idea", label: "An idea or suggestion" },
];

export type SupportSubmission = {
  topic: SupportTopic;
  message: string;
  /** Optional — only needed when the sender is not signed in. */
  replyEmail?: string;
  /** Page the request was sent from, for triage context. */
  pageUrl?: string;
};

export type SupportResult = { ok: true } | { ok: false; message: string };

/** Permissive shape check — real validation is the mail server's job. */
export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/**
 * Builds the `message` field actually sent to the API, appending the reply
 * address as a labelled line when one was given. Truncates defensively so a
 * caller that ignores `SUPPORT_MESSAGE_MAX` still cannot trip the server's
 * 2000-char validation and turn a support request into a 400.
 */
export function composeSupportMessage(
  submission: Pick<SupportSubmission, "message" | "replyEmail">
): string {
  const message = submission.message.trim();
  const replyEmail = submission.replyEmail?.trim();
  if (!message) return "";
  if (!replyEmail) return message.slice(0, API_MESSAGE_MAX);

  const suffix = `\n\n${REPLY_LABEL} ${replyEmail}`;
  return `${message.slice(0, API_MESSAGE_MAX - suffix.length)}${suffix}`;
}

export async function submitSupportRequest(
  submission: SupportSubmission
): Promise<SupportResult> {
  const replyEmail = submission.replyEmail?.trim();
  if (replyEmail && !isLikelyEmail(replyEmail)) {
    return {
      ok: false,
      message: "That email address does not look right. Check it and try again.",
    };
  }

  const message = composeSupportMessage(submission);
  if (!message) {
    return { ok: false, message: "Write a message before sending." };
  }

  let res: Response;
  try {
    res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        type: submission.topic,
        message,
        url: submission.pageUrl?.trim() || null,
      }),
    });
  } catch {
    return {
      ok: false,
      message:
        "We could not reach Verkli. Check your connection and try again, or email hello@verkli.com.",
    };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    const code = body?.error ?? null;

    // A 5xx, or an outright save failure, means the message did not land. The
    // generic copy for that code is "Failed to save feedback." — a dead end on
    // the one page whose whole job is putting a reader in touch with a human.
    // Always hand back a route that does not depend on the write succeeding.
    if (res.status >= 500 || code === "FEEDBACK_SAVE_FAILED") {
      return {
        ok: false,
        message: `${SAVE_FAILED_PREFIX} ${EMAIL_FALLBACK}`,
      };
    }

    return {
      ok: false,
      message: resolveErrorMessage(
        code,
        `We could not send your message. ${EMAIL_FALLBACK}`
      ),
    };
  }

  return { ok: true };
}
