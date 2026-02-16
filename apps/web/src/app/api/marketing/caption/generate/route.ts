import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuthorAndMarketingEnabled } from "@/lib/auth/require-author-marketing";
import { normalizeLanguage } from "@/lib/languages";
import { getCachedOrGenerateCaption } from "@/lib/marketing/caption-generator";
import { assertBookOwned } from "@/lib/marketing/assert-book-owner";
import { captionGenerateBodySchema } from "@/lib/marketing/schemas";
import {
  apiError,
  E_DATABASE_ERROR,
  E_INVALID_JSON,
  E_VALIDATION_FAILED,
} from "@/lib/api-errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireAuthorAndMarketingEnabled();
  if (gate.response) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(E_INVALID_JSON, 400);
  }

  const parsed = captionGenerateBodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(E_VALIDATION_FAILED, 400);
  }

  const { bookId, language: rawLang, channel, contentType, tone, length, cta } = parsed.data;
  const language = normalizeLanguage(rawLang);

  const supabase = await createClient();
  const ownership = await assertBookOwned(supabase, gate.user.id, bookId);
  if (!ownership.ok) return ownership.response;

  try {
    const { caption, fromCache } = await getCachedOrGenerateCaption({
      bookId,
      bookTitle: ownership.book.title ?? "Book",
      language,
      contentType,
      channel,
      tone,
      length,
      cta,
    });

    return NextResponse.json({ caption, fromCache });
  } catch (err) {
    console.error("[marketing caption generate]", err);
    return apiError(E_DATABASE_ERROR, 500);
  }
}
