import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertPublicEnv } from "@/lib/env";
import { isMarketingEnabled } from "@/lib/flags";
import { normalizeLanguage } from "@/lib/languages";
import { generateLaunchCopy, LaunchCopyError } from "@/lib/marketing/generate-launch-copy";
import { createPerUserRateLimiter } from "@/lib/rate-limit";
import { requireAuthorRoleForApi } from "@/lib/auth/require-author";
import { requireProBillingForApi } from "@/lib/billing/server";
import {
  apiError,
  isValidUuid,
  E_BOOK_NOT_FOUND,
  E_DATABASE_ERROR,
  E_INVALID_BOOK_ID,
  E_MARKETING_FEATURE_DISABLED,
  E_RATE_LIMIT_EXCEEDED,
} from "@/lib/api-errors";
import { aiDisabledResponse } from "@/features/ai-team/settings/guard";

const CHANNELS = ["generic", "tiktok", "instagram", "x"] as const;
type Channel = (typeof CHANNELS)[number];
const rateLimiter = createPerUserRateLimiter({ name: "books-marketing-generate", maxPerMinute: 3 });

function isChannel(s: string): s is Channel {
  return CHANNELS.includes(s as Channel);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  assertPublicEnv();
  if (!isMarketingEnabled()) {
    return apiError(E_MARKETING_FEATURE_DISABLED, 403);
  }
  const { id: bookId } = await params;
  if (!isValidUuid(bookId)) return apiError(E_INVALID_BOOK_ID, 400);

  // SECURITY: Require author role for marketing generation
  const { user, response } = await requireAuthorRoleForApi();
  if (response) return response;

  // Account master AI switch. Server-side, so turning AI off is a real
  // setting and not just a hidden button.
  const aiOff = await aiDisabledResponse(user.id);
  if (aiOff) return aiOff;

  const proGate = await requireProBillingForApi(user.id);
  if (!proGate.ok) return proGate.response;

  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const language = normalizeLanguage(body?.language);
  const channel: Channel = isChannel(body?.channel) ? body.channel : "generic";

  const { data: book, error: bookFetchError } = await supabase
    .from("books")
    .select("id, title, description, author_id, language, original_url")
    .eq("id", bookId)
    .maybeSingle();

  if (bookFetchError) {
    console.error("[marketing generate] book fetch failed:", bookFetchError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }
  if (!book || book.author_id !== user.id) {
    return apiError(E_BOOK_NOT_FOUND, 404);
  }

  const limit = await rateLimiter.check(user.id);
  if (!limit.allowed) {
    return apiError(E_RATE_LIMIT_EXCEEDED, 429, { retryAfterSeconds: limit.retryAfterSeconds });
  }
  let copy;
  try {
    copy = await generateLaunchCopy({ authorId: user.id, title: book.title, description: book.description, language, channel,
      meter: { userId: user.id, pipeline: "marketing", bookId } });
  } catch (error) {
    const code = error instanceof LaunchCopyError ? error.code : "MARKETING_AI_FAILED";
    console.error("[marketing generate] draft failed:", code);
    return apiError(code, code === "MARKETING_BUDGET_EXCEEDED" ? 429 : code.endsWith("UNAVAILABLE") ? 503 : 502);
  }

  const campaign = {
    book_id: bookId,
    language,
    channel,
    status: "generated",
    headline: copy.headline,
    caption: copy.body,
    cta: copy.cta,
    hashtags: copy.hashtags || null,
    share_url: `/reader/books/${bookId}`,
  };

  const { data: upserted, error: upsertError } = await supabase
    .from("marketing_campaigns")
    .upsert(campaign, { onConflict: "book_id,language,channel" })
    .select()
    .single();

  if (upsertError) {
    console.error("[marketing generate] upsert failed:", upsertError.message);
    return apiError(E_DATABASE_ERROR, 500);
  }

  return NextResponse.json(upserted);
}
