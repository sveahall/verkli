import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isNewslettersEnabled } from "@/lib/flags";
import { verifyUnsubscribeToken } from "@/lib/newsletters/unsubscribe-token";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NEWSLETTERS_FEATURE_DISABLED,
  E_NEWSLETTER_SUBSCRIBE_FAILED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const unsubscribeBodySchema = z.object({
  authorId: z.string().uuid("Invalid author ID"),
});

// Anonymous one-click unsubscribe. Mail clients call this from
// `List-Unsubscribe: <https://...>` headers and from the footer link we
// inject into every newsletter. Signed HMAC token proves the recipient
// is who the newsletter was sent to; expires after ~6 months.
async function handleTokenUnsubscribe(token: string): Promise<Response> {
  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("newsletter_subscriptions" as never)
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    } as never)
    .eq("author_id", verified.authorId)
    .eq("subscriber_user_id", verified.subscriberUserId);

  if (updateError) {
    console.error("[newsletters] token unsubscribe failed", {
      authorId: verified.authorId,
      subscriberUserId: verified.subscriberUserId,
      message: updateError.message,
    });
    return apiError(E_NEWSLETTER_SUBSCRIBE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
  }
  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (!token) return apiError(E_VALIDATION_FAILED, 400);
  return handleTokenUnsubscribe(token);
}

export async function POST(request: Request) {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
  }

  // Allow an anonymous one-click unsubscribe with a signed token — this is
  // what email clients use for the `List-Unsubscribe: One-Click` flow.
  const tokenParam = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  if (tokenParam) {
    return handleTokenUnsubscribe(tokenParam);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = unsubscribeBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { authorId } = parsed.data;

  const { error: updateError } = await supabase
    .from("newsletter_subscriptions" as never)
    .update({
      status: "unsubscribed",
      unsubscribed_at: new Date().toISOString(),
    } as never)
    .eq("author_id", authorId)
    .eq("subscriber_user_id", user.id);

  if (updateError) {
    console.error("[newsletters] unsubscribe failed", {
      userId: user.id,
      authorId,
      message: updateError.message,
      code: updateError.code,
    });
    return apiError(E_NEWSLETTER_SUBSCRIBE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}
