import { Resend } from "resend";
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

/** Allowed HTML tags for newsletter content. */
const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
  "img", "div", "span", "table", "thead", "tbody", "tr", "td", "th", "hr",
]);

const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "class", "style", "width", "height", "target", "rel",
]);

const DANGEROUS_TAGS_RE = /<(script|iframe|object|embed|form|input|textarea|button|select|style|link|meta|base|applet|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DANGEROUS_SELF_CLOSING_RE = /<(script|iframe|object|embed|form|input|textarea|button|select|style|link|meta|base|applet|svg|math)\b[^>]*\/?>/gi;
const EVENT_HANDLER_RE = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const DANGEROUS_URI_RE = /(href|src|action|formaction|xlink:href|data)\s*=\s*(?:"[^"]*javascript\s*:[^"]*"|'[^']*javascript\s*:[^']*')/gi;
const DATA_URI_SCRIPT_RE = /(href|src)\s*=\s*(?:"[^"]*data\s*:[^"]*text\/html[^"]*"|'[^']*data\s*:[^']*text\/html[^']*')/gi;

/**
 * Multi-pass regex sanitizer for newsletter HTML.
 * Strips dangerous tags, event handlers, and javascript: URIs.
 * Runs multiple passes to catch nested bypass attempts.
 */
function sanitizeNewsletterHtml(html: string): string {
  let result = html;

  // Two passes to catch nested/malformed tags (e.g., <scr<script>ipt>)
  for (let pass = 0; pass < 2; pass++) {
    result = result
      .replace(DANGEROUS_TAGS_RE, "")
      .replace(DANGEROUS_SELF_CLOSING_RE, "")
      .replace(EVENT_HANDLER_RE, " ")
      .replace(DANGEROUS_URI_RE, "")
      .replace(DATA_URI_SCRIPT_RE, "");
  }

  // Strip tags not in allowlist, and strip non-allowed attributes from allowed tags
  result = result.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (match, tag, attrs) => {
    if (!ALLOWED_TAGS.has(tag.toLowerCase())) return "";
    // Strip non-allowed attributes
    const cleanAttrs = (attrs as string).replace(
      /\s+([a-z][a-z0-9-]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
      (attrMatch, attrName) => ALLOWED_ATTRS.has(attrName.toLowerCase()) ? attrMatch : "",
    );
    return `<${match.startsWith("</") ? "/" : ""}${tag}${cleanAttrs}>`;
  });

  return result;
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
