import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isNewslettersEnabled } from "@/lib/flags";
import {
  apiError,
  E_NOT_AUTHENTICATED,
  E_NEWSLETTERS_FEATURE_DISABLED,
  E_NEWSLETTER_ALREADY_SUBSCRIBED,
  E_NEWSLETTER_SUBSCRIBE_FAILED,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

const subscribeBodySchema = z.object({
  authorId: z.string().uuid("Invalid author ID"),
});

export async function POST(request: Request) {
  if (!isNewslettersEnabled()) {
    return apiError(E_NEWSLETTERS_FEATURE_DISABLED, 403);
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

  const parsed = subscribeBodySchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { authorId } = parsed.data;

  // Check for existing subscription
  const { data: existing } = await supabase
    .from("newsletter_subscriptions" as never)
    .select("id, status")
    .eq("author_id", authorId)
    .eq("subscriber_user_id", user.id)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; status: string };
    if (row.status === "active") {
      return apiError(E_NEWSLETTER_ALREADY_SUBSCRIBED, 409);
    }

    // Re-subscribe: update status back to active
    const { error: updateError } = await supabase
      .from("newsletter_subscriptions" as never)
      .update({
        status: "active",
        unsubscribed_at: null,
      } as never)
      .eq("id", row.id);

    if (updateError) {
      console.error("[newsletters] re-subscribe failed", {
        userId: user.id,
        authorId,
        message: updateError.message,
        code: updateError.code,
      });
      return apiError(E_NEWSLETTER_SUBSCRIBE_FAILED, 500);
    }

    return NextResponse.json({ ok: true });
  }

  // New subscription
  const { error: insertError } = await supabase
    .from("newsletter_subscriptions" as never)
    .insert({
      author_id: authorId,
      subscriber_user_id: user.id,
    } as never);

  if (insertError) {
    if (insertError.code === "23505") {
      return apiError(E_NEWSLETTER_ALREADY_SUBSCRIBED, 409);
    }

    console.error("[newsletters] subscribe failed", {
      userId: user.id,
      authorId,
      message: insertError.message,
      code: insertError.code,
    });
    return apiError(E_NEWSLETTER_SUBSCRIBE_FAILED, 500);
  }

  return NextResponse.json({ ok: true });
}
