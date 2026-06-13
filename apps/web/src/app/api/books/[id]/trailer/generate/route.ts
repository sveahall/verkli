import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { getBillingStateForUser } from "@/lib/billing/server";
import { isFreemiumGateEnabled, isMarketingEnabled } from "@/lib/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apiError,
  E_UNAUTHORIZED,
  E_MARKETING_FEATURE_DISABLED,
  E_RATE_LIMIT_EXCEEDED,
  E_BOOK_NOT_FOUND,
  E_VALIDATION_FAILED,
  E_DATABASE_ERROR,
  E_TRAILER_GENERATION_FAILED,
  E_TRAILER_LIMIT_REACHED,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { getStripeCheckoutSession } from "@/lib/payments/stripe";
import { claimStripeSessionRedemption } from "@/lib/payments/session-redemption";
import {
  TrailerGenerateRequestSchema,
  generateTrailerPrompt,
} from "@/lib/ai/trailer-generation";

export const maxDuration = 300;

const rateLimiter = createPerUserRateLimiter({ maxPerMinute: 3 });
const FREE_TRAILER_LIMIT_PER_MONTH = 1;
const PRO_TRAILER_LIMIT_PER_MONTH = 5;

function getCurrentUsageMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;
  if (!user) return apiError(E_UNAUTHORIZED, 401);

  // 2. Feature flag
  if (!isMarketingEnabled()) {
    return apiError(E_MARKETING_FEATURE_DISABLED, 403);
  }

  // 3. Rate limit
  const rl = await rateLimiter.check(user.id);
  if (!rl.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  // 4. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const parsed = TrailerGenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400, {
      detail: parsed.error.flatten().fieldErrors,
    });
  }
  const request = parsed.data;

  // 5. Verify book ownership
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  const admin = createAdminClient();
  const { data: book } = await admin
    .from("books" as never)
    .select("id, author_id")
    .eq("id", bookId)
    .single();

  const bookRow = book as Record<string, unknown> | null;
  if (!bookRow || bookRow.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  // One-off trailer purchase: a valid PAID trailer session, atomically
  // redeemed once, grants an extra trailer past the monthly quota (mirrors the
  // audiobook one-off bypass). The usage counter still records the generation.
  const rawBody = body as Record<string, unknown> | null;
  const stripeSessionId =
    rawBody && typeof rawBody.stripeSessionId === "string" && rawBody.stripeSessionId.trim()
      ? rawBody.stripeSessionId.trim()
      : null;
  let paidViaStripe = false;
  if (stripeSessionId) {
    try {
      const session = await getStripeCheckoutSession(stripeSessionId);
      const meta = (session.metadata ?? {}) as Record<string, string>;
      if (
        session.payment_status === "paid" &&
        meta.payment_kind === "trailer" &&
        meta.user_id === user.id &&
        meta.book_id === bookId
      ) {
        try {
          paidViaStripe = await claimStripeSessionRedemption(admin, {
            sessionId: stripeSessionId,
            kind: "trailer",
            userId: user.id,
            bookId,
          });
        } catch (error) {
          console.error("[trailer generate] redemption claim failed", {
            stripeSessionId,
            userId: user.id,
            bookId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      console.warn("[trailer generate] stripe session verification failed", {
        stripeSessionId,
        userId: user.id,
        bookId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 6. Monthly usage guardrail (free: 1, pro: 5)
  const billing = await getBillingStateForUser(user.id, "author");
  if (!billing.ok) {
    return billing.response;
  }

  const monthlyLimit = billing.state.isProActive
    ? PRO_TRAILER_LIMIT_PER_MONTH
    : FREE_TRAILER_LIMIT_PER_MONTH;
  const usageMonth = getCurrentUsageMonth();

  const { data: usage, error: usageError } = await admin
    .from("user_usage_monthly" as never)
    .select("trailer_count_this_month")
    .eq("user_id", user.id)
    .eq("usage_month", usageMonth)
    .maybeSingle();

  if (usageError) {
    console.error("[trailer guardrail] failed to read monthly usage", {
      userId: user.id,
      usageMonth,
      message: usageError.message,
      code: usageError.code,
    });
    return apiError(E_DATABASE_ERROR, 500);
  }

  const usageRow = usage as { trailer_count_this_month?: number | null } | null;
  const trailerCountThisMonth = Math.max(
    0,
    Number(usageRow?.trailer_count_this_month ?? 0) || 0
  );
  // Freemium gate: when off (default during cohort-gated soft launch) the
  // monthly limit is not enforced, but usage is still recorded so the counter
  // is current the moment the flag flips on. See CEO plan §C2 / D11.
  if (!paidViaStripe && isFreemiumGateEnabled() && trailerCountThisMonth >= monthlyLimit) {
    console.warn("[trailer guardrail] trailer limit reached", {
      userId: user.id,
      usageMonth,
      trailerCountThisMonth,
      monthlyLimit,
      isPro: billing.state.isProActive,
    });
    return apiError(E_TRAILER_LIMIT_REACHED, 403);
  }

  // Atomic increment: use RPC or conditional upsert to prevent TOCTOU race.
  // First try to increment an existing row (optimistic lock via current count).
  const nextTrailerCount = trailerCountThisMonth + 1;

  if (trailerCountThisMonth > 0) {
    // Row exists — update only if count matches what we read (optimistic lock)
    const { data: updated, error: updateError } = await admin
      .from("user_usage_monthly" as never)
      .update({ trailer_count_this_month: nextTrailerCount } as never)
      .eq("user_id", user.id)
      .eq("usage_month", usageMonth)
      .eq("trailer_count_this_month", trailerCountThisMonth)
      .select("trailer_count_this_month")
      .maybeSingle();

    if (updateError) {
      console.error("[trailer guardrail] failed to reserve monthly usage slot", {
        userId: user.id,
        usageMonth,
        nextTrailerCount,
        message: updateError.message,
        code: updateError.code,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }

    if (!updated) {
      // Concurrent request already incremented — re-check limit
      return apiError(E_TRAILER_LIMIT_REACHED, 403);
    }
  } else {
    // No row yet — insert with count=1. Unique constraint prevents double-insert.
    const { error: insertError } = await admin
      .from("user_usage_monthly" as never)
      .upsert(
        {
          user_id: user.id,
          usage_month: usageMonth,
          trailer_count_this_month: 1,
        } as never,
        { onConflict: "user_id,usage_month" }
      );

    if (insertError) {
      console.error("[trailer guardrail] failed to reserve monthly usage slot", {
        userId: user.id,
        usageMonth,
        message: insertError.message,
        code: insertError.code,
      });
      return apiError(E_DATABASE_ERROR, 500);
    }
  }

  // 7. Generate trailer prompt metadata
  try {
    const result = await generateTrailerPrompt(request);

    return NextResponse.json({
      ok: true,
      bookId,
      scenes: result.output.scenes,
      caption: result.output.caption,
      hashtags: result.output.hashtags,
      title_card: result.output.title_card,
      metadata: result.metadata,
    });
  } catch (err) {
    // Rollback the reserved quota slot on failure.
    // Use optimistic lock: only decrement if count still matches what we set.
    try {
      await admin
        .from("user_usage_monthly" as never)
        .update({ trailer_count_this_month: trailerCountThisMonth } as never)
        .eq("user_id", user.id)
        .eq("usage_month", usageMonth)
        .eq("trailer_count_this_month", nextTrailerCount);
    } catch (rollbackErr) {
      console.error("[trailer guardrail] quota rollback failed", {
        userId: user.id,
        usageMonth,
        message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
      });
    }

    console.error(
      "[trailer guardrail] trailer generation failed, quota rolled back",
      err instanceof Error ? err.message : String(err)
    );
    return apiError(E_TRAILER_GENERATION_FAILED, 500);
  }
}
