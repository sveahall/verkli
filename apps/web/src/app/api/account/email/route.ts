import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  apiError,
  E_INVALID_JSON,
  E_NOT_AUTHENTICATED,
  E_RATE_LIMIT_EXCEEDED,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

const changeLimiter = createPerUserRateLimiter({ maxPerMinute: 3 });

const bodySchema = z.object({
  email: z.string().trim().email().max(320),
});

/**
 * Initiate an email-change.
 *
 * Supabase auth handles the actual confirmation flow: calling
 * `supabase.auth.updateUser({ email })` sends a confirmation message to
 * both the old and the new address. The email on the auth row only flips
 * once the new address is confirmed. This route is a thin, rate-limited
 * wrapper so settings pages have a single place to call.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rl = await changeLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }
  const nextEmail = parsed.data.email.toLowerCase();

  if (user.email?.toLowerCase() === nextEmail) {
    // No-op but report success so the UI treats it as idempotent.
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error } = await supabase.auth.updateUser({ email: nextEmail });
  if (error) {
    console.error("[account.email] updateUser failed", {
      userId: user.id,
      message: error.message,
    });
    return apiError(E_VALIDATION_FAILED, 400);
  }

  return NextResponse.json({ ok: true, pendingConfirmation: true });
}
