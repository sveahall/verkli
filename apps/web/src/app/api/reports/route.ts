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
  E_DATABASE_ERROR,
} from "@/lib/api-errors";

export const runtime = "nodejs";

// Tight rate limit: submitting a report should be rare and deliberate; the
// partial-unique index on (reporter, target) stops accidental duplicates on
// its own, but a per-user token bucket also keeps a malicious user from
// spamming distinct targets.
const reportLimiter = createPerUserRateLimiter({ maxPerMinute: 10 });

const TARGET_TYPES = ["comment", "review", "book", "message", "user", "other"] as const;
const REASON_CODES = [
  "harassment",
  "spam",
  "hate_speech",
  "sexual_content",
  "copyright",
  "illegal",
  "other",
] as const;

const bodySchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().trim().min(1).max(128),
  reasonCode: z.enum(REASON_CODES),
  detail: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError(E_NOT_AUTHENTICATED, 401);
  }

  const rl = await reportLimiter.check(user.id);
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
  const { targetType, targetId, reasonCode, detail } = parsed.data;

  const { error, data } = await supabase
    .from("content_reports")
    .insert({
      reporter_user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason_code: reasonCode,
      detail: detail ?? null,
    })
    .select("id, created_at")
    .maybeSingle();

  if (error) {
    // 23505 = duplicate pending report against the same target by this user.
    // Treat it as success to avoid leaking that an identical report exists.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[reports] insert failed", {
      userId: user.id,
      targetType,
      targetId,
      message: error.message,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json({
    ok: true,
    id: data?.id ?? null,
    createdAt: data?.created_at ?? null,
  });
}
