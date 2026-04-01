import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isMarketingEnabled } from "@/lib/flags";
import { normalizeLanguage } from "@/lib/languages";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import { enqueueMarketingJob } from "@/lib/marketing-queue";
import { getBookAsOwner } from "@/lib/books/service";
import {
  apiError,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_MARKETING_FEATURE_DISABLED,
  E_VALIDATION_FAILED,
  E_INVALID_BOOK_ID,
  isValidUuid,
} from "@/lib/api-errors";

const ALL_CHANNELS = ["generic", "tiktok", "instagram", "x"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();

  // Feature flag
  if (!isMarketingEnabled()) {
    return apiError(E_MARKETING_FEATURE_DISABLED, 403);
  }

  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  // Auth
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  // Validation
  const body = await request.json().catch(() => ({}));
  const language = normalizeLanguage(body?.language);
  const channels: string[] = Array.isArray(body?.channels)
    ? body.channels.filter((c: unknown) => typeof c === "string" && ALL_CHANNELS.includes(c))
    : ALL_CHANNELS;

  if (channels.length === 0) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  // Ownership check
  const supabase = await createClient();
  const bookResult = await getBookAsOwner(supabase, bookId, user.id, "id, author_id");
  if (!bookResult.ok) {
    return apiError(
      bookResult.error === "book_not_found" ? E_BOOK_NOT_FOUND : E_DATABASE_ERROR,
      bookResult.error === "book_not_found" ? 404 : 500,
    );
  }

  // Service call
  const jobId = await enqueueMarketingJob({
    bookId,
    authorId: user.id,
    channels,
    language,
  });

  if (!jobId) {
    return NextResponse.json(
      { error: "Could not enqueue job — Redis may be unavailable" },
      { status: 503 }
    );
  }

  // Response
  return NextResponse.json({ ok: true, data: { jobId, status: "queued" } });
}
