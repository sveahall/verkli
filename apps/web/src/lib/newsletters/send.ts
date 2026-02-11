import { Resend } from "resend";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

type SubscriberRow = {
  subscriber_user_id: string;
  profiles: { email: string | null; display_name: string | null } | null;
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

  // Filter to subscribers that have an email
  const emails = rows
    .map((r) => {
      const profile = r.profiles;
      if (!profile || !profile.email) return null;
      return { email: profile.email, name: profile.display_name ?? undefined };
    })
    .filter((e): e is { email: string; name: string | undefined } => e !== null);

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

  const htmlBody = nl.body_html || "<p></p>";
  const textBody = nl.body_text || "";

  const batchMessages = emails.map((recipient) => ({
    from: env.RESEND_FROM_EMAIL,
    to: recipient.email,
    subject: nl.subject,
    html: htmlBody,
    text: textBody,
  }));

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
