import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isNewslettersEnabled } from "@/lib/flags";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NEWSLETTERS_FEATURE_DISABLED,
  E_NEWSLETTER_NOT_FOUND,
  E_NEWSLETTER_ALREADY_SENT,
  E_NEWSLETTER_SEND_FAILED,
  E_FORBIDDEN,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";
import { sendNewsletter } from "@/lib/newsletters/send";

const sendLimiter = createPerUserRateLimiter({ maxPerMinute: 2 });

const paramsSchema = z.object({
  id: z.string().uuid("Invalid newsletter ID"),
});

type NewsletterRow = {
  id: string;
  author_id: string;
  status: string;
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { id } = parsedParams.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rl = await sendLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: rl.retryAfterSeconds });
  }

  // Verify newsletter exists and belongs to user
  const { data: newsletter, error: lookupError } = await supabase
    .from("newsletters" as never)
    .select("id, author_id, status")
    .eq("id", id)
    .maybeSingle();

  if (lookupError || !newsletter) {
    return apiError(E_NEWSLETTER_NOT_FOUND, 404);
  }

  const nl = newsletter as NewsletterRow;

  if (nl.author_id !== user.id) {
    return apiError(E_FORBIDDEN, 403);
  }

  if (nl.status === "sent") {
    return apiError(E_NEWSLETTER_ALREADY_SENT, 400);
  }

  try {
    const result = await sendNewsletter(id);
    return NextResponse.json({ ok: true, recipientCount: result.recipientCount });
  } catch (err) {
    console.error("[newsletters] send failed", {
      newsletterId: id,
      userId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return apiError(E_NEWSLETTER_SEND_FAILED, 500);
  }
}
