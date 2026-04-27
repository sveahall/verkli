import { Resend } from "resend";
import sanitizeHtml from "sanitize-html";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUnsubscribeToken } from "@/lib/newsletters/unsubscribe-token";

function getUnsubscribeBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!base) {
    throw new Error(
      "Cannot render unsubscribe URL: set NEXT_PUBLIC_SITE_URL (or NEXT_PUBLIC_APP_URL)"
    );
  }
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function buildUnsubscribeUrl(authorId: string, subscriberUserId: string): string {
  const token = createUnsubscribeToken(authorId, subscriberUserId);
  const base = getUnsubscribeBaseUrl();
  return `${base}/api/newsletters/unsubscribe?token=${encodeURIComponent(token)}`;
}

function renderUnsubscribeFooter(unsubscribeUrl: string): string {
  return (
    `<hr style="margin:32px 0;border:none;border-top:1px solid #e5e7eb" />` +
    `<p style="color:#64748b;font-size:12px;line-height:1.5;margin:0">` +
    `You received this email because you subscribed to this author's newsletter. ` +
    `<a href="${unsubscribeUrl}" style="color:#64748b;text-decoration:underline">Unsubscribe</a>.` +
    `</p>`
  );
}

// Parser-based sanitizer config. Email-safe allowlist of tags + attributes;
// `sanitize-html` parses to a DOM tree (htmlparser2) so it doesn't fall over
// on malformed/nested constructs the way a regex sweep can.
const NEWSLETTER_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "b", "strong", "i", "em", "u", "s", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
    "img", "div", "span", "table", "thead", "tbody", "tr", "td", "th", "hr",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    "*": ["class", "style", "width", "height"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  allowProtocolRelative: false,
  // sanitize-html strips style attributes by default unless opted in. Keep
  // them but constrain to safe declarations so newsletter authors can theme
  // colors/spacing without smuggling `expression()` / `url(javascript:…)`.
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
      "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^[a-zA-Z]+$/],
      "text-align": [/^(left|right|center|justify)$/],
      "font-size": [/^\d+(\.\d+)?(px|em|rem|%)$/],
      "font-weight": [/^(normal|bold|\d{3})$/],
      "line-height": [/^\d+(\.\d+)?(px|em|rem|%)?$/],
      margin: [/^[\d\s.pxemr%-]+$/],
      padding: [/^[\d\s.pxemr%-]+$/],
      border: [/^[\d\s.pxemr%#a-fA-F-]+(solid|dashed|dotted)?[\d\s.pxemr%#a-fA-F-]*$/],
      "border-radius": [/^\d+(\.\d+)?(px|em|rem|%)$/],
    },
  },
  // Force-add rel="noopener noreferrer" on links so a compromised newsletter
  // can't reach back into the email client's window in clients that respect it.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
  disallowedTagsMode: "discard",
};

function sanitizeNewsletterHtml(html: string): string {
  return sanitizeHtml(html, NEWSLETTER_SANITIZE_OPTIONS);
}

type SubscriberRow = {
  subscriber_user_id: string;
  profiles: { email: string | null; display_name: string | null } | null;
};

type RecipientWithIdentity = {
  email: string;
  name: string | undefined;
  subscriberUserId: string;
};

type NewsletterRow = {
  id: string;
  author_id: string;
  subject: string;
  body_html: string;
  body_text: string;
  status: string;
};

/**
 * Sends a newsletter to all active subscribers.
 * Uses the admin client to bypass RLS for fetching subscribers.
 */
export async function sendNewsletter(
  newsletterId: string
): Promise<{ recipientCount: number }> {
  const env = getServerEnv();
  const supabase = createAdminClient();

  // Fetch newsletter
  const { data: newsletter, error: nlError } = await supabase
    .from("newsletters")
    .select("id, author_id, subject, body_html, body_text, status")
    .eq("id", newsletterId)
    .single();

  if (nlError || !newsletter) {
    throw new Error(`Newsletter not found: ${newsletterId}`);
  }

  const nl = newsletter as NewsletterRow;

  if (nl.status === "sent") {
    throw new Error(`Newsletter already sent: ${newsletterId}`);
  }

  // Fetch active subscribers with their email from profiles
  const { data: subscribers, error: subError } = await supabase
    .from("newsletter_subscriptions")
    .select("subscriber_user_id, profiles:subscriber_user_id(email, display_name)")
    .eq("author_id", nl.author_id)
    .eq("status", "active");

  if (subError) {
    throw new Error(`Failed to load subscribers: ${subError.message}`);
  }

  const rows = (subscribers ?? []) as unknown as SubscriberRow[];

  // Filter to subscribers that have an email, keeping the subscriber id so we
  // can produce a signed per-recipient unsubscribe URL.
  const emails: RecipientWithIdentity[] = rows
    .map((r) => {
      const profile = r.profiles;
      if (!profile || !profile.email) return null;
      return {
        email: profile.email,
        name: profile.display_name ?? undefined,
        subscriberUserId: r.subscriber_user_id,
      };
    })
    .filter((e): e is RecipientWithIdentity => e !== null);

  if (emails.length === 0) {
    // Mark as sent with 0 recipients
    await supabase
      .from("newsletters")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: 0,
      })
      .eq("id", newsletterId);

    return { recipientCount: 0 };
  }

  // Send via Resend batch API
  const resend = new Resend(env.RESEND_API_KEY);

  // C1: Server-side sanitize HTML to prevent XSS in email delivery
  const sanitizedHtml = sanitizeNewsletterHtml(nl.body_html || "<p></p>");
  const textBody = nl.body_text || "";

  const batchMessages = emails.map((recipient) => {
    const unsubscribeUrl = buildUnsubscribeUrl(nl.author_id, recipient.subscriberUserId);
    const htmlForRecipient = sanitizedHtml + renderUnsubscribeFooter(unsubscribeUrl);
    const textForRecipient =
      textBody +
      (textBody.length > 0 ? "\n\n" : "") +
      `Unsubscribe: ${unsubscribeUrl}`;
    return {
      from: env.RESEND_FROM_EMAIL,
      to: recipient.email,
      subject: nl.subject,
      html: htmlForRecipient,
      text: textForRecipient,
      // RFC 2369 / RFC 8058: let mail clients offer a one-click unsubscribe.
      // Mandatory in practice for bulk senders to avoid spam classification.
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });

  // Resend batch API supports up to 100 emails per call
  const BATCH_SIZE = 100;
  let totalSent = 0;

  for (let i = 0; i < batchMessages.length; i += BATCH_SIZE) {
    const batch = batchMessages.slice(i, i + BATCH_SIZE);
    try {
      await resend.batch.send(batch);
      totalSent += batch.length;
    } catch (err) {
      console.error("[newsletters] batch send failed", {
        newsletterId,
        batchStart: i,
        batchSize: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Update newsletter status
  await supabase
    .from("newsletters")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      recipient_count: totalSent,
    })
    .eq("id", newsletterId);

  return { recipientCount: totalSent };
}
