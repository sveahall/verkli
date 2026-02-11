import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isNewslettersEnabled } from "@/lib/flags";
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
