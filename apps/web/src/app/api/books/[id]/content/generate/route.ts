import { NextResponse } from "next/server";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { isMarketingEnabled } from "@/lib/flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookAsOwner } from "@/lib/books/service";
import {
  apiError,
  E_UNAUTHORIZED,
  E_MARKETING_FEATURE_DISABLED,
  E_RATE_LIMIT_EXCEEDED,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_VALIDATION_FAILED,
  E_CONTENT_INVALID_CHANNEL_TYPE,
  E_CONTENT_GENERATION_FAILED,
} from "@/lib/api-errors";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import {
  ContentGenerationRequestSchema,
  CHANNEL_CONSTRAINTS,
  generateContent,
  buildBookSnapshot,
} from "@/lib/ai/content-generation";

export const maxDuration = 300;

const rateLimiter = createPerUserRateLimiter({ maxPerMinute: 3 });

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

  // 4. Billing gate
  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  // 5. Parse + validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const parsed = ContentGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400, {
      detail: parsed.error.flatten().fieldErrors,
    });
  }
  const request = parsed.data;

  // Validate channel supports content type
  const constraints = CHANNEL_CONSTRAINTS[request.channel];
  if (!constraints.allowedContentTypes.includes(request.contentType)) {
    return apiError(E_CONTENT_INVALID_CHANNEL_TYPE, 400);
  }

  // 6. Verify book ownership
  const { id: bookId } = await params;
  const admin = createAdminClient();
  const bookResult = await getBookAsOwner(admin, bookId, user.id, "id, author_id");
  if (!bookResult.ok) {
    return apiError(
      bookResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      bookResult.error === "book_not_found" ? 404 : 500,
    );
  }

  // 7. Build snapshot + generate
  try {
    const snapshot = await buildBookSnapshot(bookId);
    if (!snapshot) {
      return apiError(E_BOOK_NOT_FOUND, 404);
    }

    const result = await generateContent({
      bookId,
      userId: user.id,
      request,
      snapshot,
    });

    return NextResponse.json({
      ok: true,
      data: {
        assetId: result.assetId,
        version: result.version,
        contentType: result.contentType,
        channel: result.channel,
        assetUrl: result.assetUrl,
        textContent: result.textContent,
        metadata: result.metadata,
      },
    });
  } catch (err) {
    console.error(
      "[content-generate] failed",
      err instanceof Error ? err.message : String(err)
    );
    return apiError(E_CONTENT_GENERATION_FAILED, 500);
  }
}
